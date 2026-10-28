// file xử lý PayOS, tạo link thanh toán và cập nhật webhook đã xác thực.
import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PayOS, type Webhook, type WebhookData } from '@payos/node';
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { OrderStatus, PaymentMethod, PaymentRecordStatus, PaymentStatus } from '../database/entities/enums';
import { Order } from '../database/entities/order.entity';
import { Payment } from '../database/entities/payment.entity';
import { User } from '../database/entities/user.entity';

@Injectable()
export class PaymentService {
  private payos: PayOS | null = null;
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async confirmDemoCardPayment(userId: number, orderId: number, pin: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        where: { id: orderId }, lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
      if (order.userId !== userId) throw new ForbiddenException('Bạn không có quyền thanh toán đơn hàng này.');
      if (order.paymentMethod !== PaymentMethod.CARD) throw new BadRequestException('Đơn hàng này không thanh toán bằng thẻ.');
      if (order.status === OrderStatus.CANCELLED) throw new BadRequestException('Đơn hàng đã bị hủy.');
      if (order.paymentStatus === PaymentStatus.PAID) return { alreadyPaid: true };

      const user = await manager.getRepository(User).findOne({
        where: { id: userId }, lock: { mode: 'pessimistic_write' },
      });
      if (!user?.transactionPinHash || !user.cardHolder || !user.cardType || !user.cardProvider || !user.cardLast4 || !user.cardExpMonth || !user.cardExpYear) {
        throw new BadRequestException('Hãy lưu thông tin thẻ và tạo PIN thanh toán trong hồ sơ trước.');
      }
      if (user.transactionPinLockedUntil && user.transactionPinLockedUntil.getTime() > Date.now()) {
        return { locked: true };
      }

      if (!(await bcrypt.compare(pin, user.transactionPinHash))) {
        user.transactionPinFailedAttempts += 1;
        if (user.transactionPinFailedAttempts >= 5) {
          user.transactionPinFailedAttempts = 0;
          user.transactionPinLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }
        await manager.save(User, user);
        return { invalidPin: true, locked: Boolean(user.transactionPinLockedUntil) };
      }

      const payment = await manager.getRepository(Payment).findOne({
        where: { orderId: order.id }, lock: { mode: 'pessimistic_write' },
      });
      if (!payment || payment.method !== PaymentMethod.CARD || payment.status !== PaymentRecordStatus.PENDING) {
        throw new BadRequestException('Trạng thái thanh toán không hợp lệ.');
      }

      payment.status = PaymentRecordStatus.SUCCESS;
      payment.transactionId = `DEMO-CARD-${order.id}-${Date.now()}`;
      payment.paidAt = new Date();
      order.paymentStatus = PaymentStatus.PAID;
      if (order.status === OrderStatus.PENDING) order.status = OrderStatus.CONFIRMED;
      user.transactionPinFailedAttempts = 0;
      user.transactionPinLockedUntil = null;
      await manager.save(Payment, payment);
      await manager.save(Order, order);
      await manager.save(User, user);
      return { paid: true };
    });

    if ('locked' in result && result.locked) {
      throw new HttpException('PIN bị khóa trong 15 phút do nhập sai nhiều lần.', HttpStatus.TOO_MANY_REQUESTS);
    }
    if ('invalidPin' in result && result.invalidPin) {
      if (result.locked) throw new HttpException('PIN bị khóa trong 15 phút do nhập sai nhiều lần.', HttpStatus.TOO_MANY_REQUESTS);
      throw new UnauthorizedException('PIN thanh toán không chính xác.');
    }
    return { success: true, alreadyPaid: 'alreadyPaid' in result && result.alreadyPaid, simulated: true };
  }

  async createPayOSLink(userId: number, orderId: number) {
    const { order, payment } = await this.dataSource.transaction(async manager => {
      const order = await manager.getRepository(Order).findOne({ where: { id: orderId }, lock: { mode: 'pessimistic_write' } });
      this.assertOwned(order, userId);
      if (!this.isPayOSMethod(order!.paymentMethod) || order!.status === OrderStatus.CANCELLED || order!.paymentStatus === PaymentStatus.PAID) throw new BadRequestException('Đơn hàng không còn ở trạng thái chờ thanh toán QR.');
      if (!Number.isSafeInteger(Number(order!.totalAmount)) || Number(order!.totalAmount) <= 0) throw new BadRequestException('PayOS yêu cầu số tiền thanh toán lớn hơn 0. Hãy chọn phương thức khác trước khi đặt hàng.');
      const repo = manager.getRepository(Payment);
      const payment = await repo.findOne({ where: { orderId }, lock: { mode: 'pessimistic_write' } });
      if (!payment || !this.isPayOSMethod(payment.method) || payment.status !== PaymentRecordStatus.PENDING || Number(payment.amount) !== Number(order!.totalAmount)) throw new BadRequestException('Trạng thái thanh toán không hợp lệ.');
      if (payment.payosLeaseUntil && payment.payosLeaseUntil.getTime() > Date.now()) throw new ConflictException('Đang chuẩn bị link thanh toán. Vui lòng kiểm tra lại sau ít giây.');
      payment.payosLeaseUntil = new Date(Date.now() + 60_000); await repo.save(payment);
      return { order: order!, payment };
    });
    // The lease is committed before contacting PayOS; a slow external API never holds DB locks.
    try {
      let remote = await this.lookupLink(orderId);
      let checkoutUrl = payment.payosCheckoutUrl;
      if (!remote) {
        try {
          const created = await this.getPayOS().paymentRequests.create({ orderCode: Number(order.id), amount: Number(order.totalAmount), description: `DH${order.id}`,
            returnUrl: this.buildReturnUrl(order.id), cancelUrl: this.config.getOrThrow<string>('PAYOS_CANCEL_URL'),
            buyerName: order.fullName, buyerEmail: order.email, buyerPhone: order.phone, buyerAddress: order.address });
          this.assertRemote(order, { orderCode: created.orderCode, amount: created.amount, id: created.paymentLinkId });
          if (created.status !== 'PENDING') throw new BadRequestException('Link thanh toán không còn hiệu lực.');
          checkoutUrl = created.checkoutUrl;
          remote = { id: created.paymentLinkId, orderCode: created.orderCode, amount: created.amount, status: created.status } as NonNullable<typeof remote>;
        } catch (error) {
          if (error instanceof HttpException) throw error;
          // A timeout may mean PayOS created the link. Recover using the same orderCode, never a new code.
          remote = await this.lookupLink(orderId);
          if (!remote) throw new ServiceUnavailableException('Chưa thể tạo link PayOS. Đơn đã được giữ; thử lại thanh toán cho cùng đơn.');
        }
      }
      this.assertRemote(order, remote);
      if (payment.payosLinkId && payment.payosLinkId !== remote.id) throw new BadRequestException('Mã link PayOS không khớp giao dịch đã lưu.');
      if (remote.status === 'PAID') { await this.refreshStatus(userId, orderId); throw new ConflictException('Đơn đã được thanh toán. Hãy kiểm tra lại trạng thái.'); }
      if (!['PENDING', 'UNDERPAID', 'PROCESSING'].includes(remote.status)) throw new BadRequestException('Link PayOS đã hết hiệu lực hoặc bị hủy. Không tạo thêm đơn để thanh toán lại.');
      // PayOS documents this URL format; GET recovery also works if the first POST response was lost.
      checkoutUrl ||= `https://pay.payos.vn/web/${remote.id}`;
      const url = new URL(checkoutUrl);
      if (url.origin !== 'https://pay.payos.vn' || url.username || url.password || url.pathname !== `/web/${remote.id}`) throw new ServiceUnavailableException('Link PayOS trả về không hợp lệ.');
      await this.payments.update({ id: payment.id }, { payosLinkId: remote.id, payosCheckoutUrl: checkoutUrl });
      return { checkoutUrl };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Chưa thể kết nối PayOS. Vui lòng thử lại thanh toán cho cùng đơn.');
    } finally { await this.payments.update({ id: payment.id, payosLeaseUntil: payment.payosLeaseUntil! }, { payosLeaseUntil: null }); }
  }

  async handlePayOSWebhook(body: Webhook) {
    let data: WebhookData;
    try {
      data = await this.getPayOS().webhooks.verify(body);
    } catch {
      throw new BadRequestException('Webhook PayOS không hợp lệ');
    }

    if (!body.success || data.code !== '00') {
      return { ok: true };
    }

    if (data.currency !== 'VND') throw new BadRequestException('Loại tiền giao dịch PayOS không hợp lệ.');

    return this.settleVerified(Number(data.orderCode), Number(data.amount), data.reference, data.transactionDateTime, data.paymentLinkId);
  }

  async refreshStatus(userId: number, orderId: number) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    this.assertOwned(order, userId);
    if (order!.paymentStatus === PaymentStatus.PAID || !this.isPayOSMethod(order!.paymentMethod)) return;
    const remote = await this.lookupLink(orderId);
    if (!remote) return;
    this.assertRemote(order!, remote);
    if (remote.status !== 'PAID') return;
    const transactions = remote.transactions ?? [];
    if (!Number.isSafeInteger(remote.amountPaid) || remote.amountPaid < Number(order!.totalAmount) || remote.amountRemaining !== 0 || !transactions.length || transactions.some(row => !Number.isSafeInteger(row.amount) || row.amount < 0) || transactions.reduce((sum, row) => sum + row.amount, 0) < Number(order!.totalAmount)) throw new BadRequestException('Dữ liệu giao dịch PayOS chưa đủ để xác nhận thanh toán.');
    const transaction = transactions.at(-1)!;
    await this.settleVerified(orderId, remote.amount, transaction.reference, transaction.transactionDateTime, remote.id);
  }

  private async lookupLink(orderId: number) {
    try { return await this.getPayOS().paymentRequests.get(orderId); } catch (error) {
      const payosError = error as { status?: number; code?: string; message?: string; response?: { data?: unknown } };
      // PayOS may return HTTP 200 with business code 101 when no link exists yet.
      if (payosError.status === 404 || ['101', '231'].includes(payosError.code ?? '')) return null;
      this.logger.error('PayOS payment lookup failed', {
        orderCode: orderId,
        status: payosError.status,
        code: payosError.code,
        message: payosError.message,
        response: payosError.response?.data,
      });
      throw new ServiceUnavailableException('Chưa thể xác minh thông tin từ PayOS. Vui lòng kiểm tra lại sau.');
    }
  }

  private assertOwned(order: Order | null, userId: number) {
    if (!order) throw new NotFoundException('Không tìm thấy đơn hàng.');
    if (order.userId !== userId) throw new ForbiddenException('Bạn không có quyền thanh toán đơn hàng này.');
  }

  private assertRemote(order: Order, remote: { id: string; amount: number; orderCode: number }) {
    if (!Number.isSafeInteger(remote.orderCode) || remote.orderCode !== Number(order.id) || remote.amount !== Number(order.totalAmount) || !/^[a-zA-Z0-9_-]{1,64}$/.test(remote.id)) throw new BadRequestException('Dữ liệu đơn hoặc số tiền PayOS không khớp.');
  }

  private async settleVerified(orderId: number, amount: number, reference: string, date: string, linkId: string) {
    if (!Number.isSafeInteger(orderId) || orderId < 1 || !Number.isSafeInteger(amount) || amount <= 0 || typeof reference !== 'string' || !reference.trim() || reference.length > 100 || typeof date !== 'string' || !date || !/^[a-zA-Z0-9_-]{1,64}$/.test(linkId ?? '')) throw new BadRequestException('Thông tin giao dịch PayOS không hợp lệ.');
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.getRepository(Order).findOne({
        where: { id: orderId }, lock: { mode: 'pessimistic_write' },
      });
      if (!order) return { ok: true };

      const payment = await manager.getRepository(Payment).findOne({ where: { orderId: order.id }, lock: { mode: 'pessimistic_write' } });
      if (!payment || !this.isPayOSMethod(order.paymentMethod) || !this.isPayOSMethod(payment.method)) {
        return { ok: true };
      }

      if (amount !== Number(order.totalAmount) || amount !== Number(payment.amount) || payment.payosLinkId && payment.payosLinkId !== linkId) throw new BadRequestException('Mã link hoặc số tiền giao dịch PayOS không khớp đơn hàng.');

      if (order.paymentStatus === PaymentStatus.PAID && payment.status === PaymentRecordStatus.SUCCESS) {
        return { ok: true };
      }

      payment.status = PaymentRecordStatus.SUCCESS;
      payment.transactionId = reference;
      payment.payosLinkId = linkId;
      payment.paidAt = this.parsePayOSDate(date);
      order.paymentStatus = PaymentStatus.PAID;
      // A verified PayOS webhook is the source of truth: move the order into
      // processing automatically once the online payment has settled.
      if (order.status === OrderStatus.PENDING) order.status = OrderStatus.CONFIRMED;

      await manager.save(Payment, payment);
      await manager.save(Order, order);

      return { ok: true };
    });
  }

  private getPayOS() {
    if (!this.payos) {
      this.payos = new PayOS({
        clientId: this.config.getOrThrow<string>('PAYOS_CLIENT_ID'),
        apiKey: this.config.getOrThrow<string>('PAYOS_API_KEY'),
        checksumKey: this.config.getOrThrow<string>('PAYOS_CHECKSUM_KEY'),
        timeout: 10_000, maxRetries: 0, logger: null,
      });
    }

    return this.payos;
  }

  private isPayOSMethod(method: PaymentMethod) {
    // QR is the current public checkout option; PAYOS remains supported for
    // orders created before the checkout method was renamed.
    return method === PaymentMethod.QR || method === PaymentMethod.PAYOS;
  }

  private buildReturnUrl(orderId: number) {
    const rawUrl = this.config.get<string>('PAYOS_RETURN_URL', 'http://localhost:5173/checkout/success');
    const resolved = rawUrl.replace(':orderId', String(orderId)).replace('{orderId}', String(orderId));
    if (resolved !== rawUrl) return resolved;

    const [base, query] = rawUrl.split('?');
    const url = `${base.replace(/\/+$/, '')}/${orderId}`;
    return query ? `${url}?${query}` : url;
  }

  private parsePayOSDate(value: string) {
    const parsed = new Date(value.replace(' ', 'T'));
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException('Thời gian giao dịch PayOS không hợp lệ.');
    return parsed;
  }
}
