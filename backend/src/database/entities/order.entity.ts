// file định nghĩa entity order và ánh xạ dữ liệu của entity này với bảng trong database.
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { OrderStatus, PaymentMethod, PaymentStatus } from './enums';
import { User } from './user.entity';
import { OrderItem } from './order-item.entity';
import { Payment } from './payment.entity';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'user_id', type: 'bigint' })
  userId: number;

  @Column({ name: 'full_name', length: 100 })
  fullName: string;

  @Column({ length: 100 })
  email: string;

  @Column({ length: 15 })
  phone: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 0 })
  totalAmount: string;

  @Column({ name: 'subtotal_amount', type: 'decimal', precision: 15, scale: 0, default: 0 })
  subtotalAmount: string;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 0, default: 0 })
  discountAmount: string;

  @Column({ name: 'coupon_code', type: 'varchar', length: 50, nullable: true })
  couponCode: string | null;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ name: 'payment_method', type: 'enum', enum: PaymentMethod })
  paymentMethod: PaymentMethod;

  @Column({ name: 'payment_status', type: 'enum', enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.orders, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @OneToOne(() => Payment, (payment) => payment.order, { cascade: true })
  payment: Payment | null;
}
