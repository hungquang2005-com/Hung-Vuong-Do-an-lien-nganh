import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthUser } from '../common/types/auth-user.type';
import { CouponsService } from './coupons.service';
import { Coupon } from '../database/entities/coupon.entity';
import { ValidateCouponDto } from './validate-coupon.dto';

@Controller('coupons')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@CurrentUser() user: AuthUser) {
    return this.couponsService.findAll(user.id);
  }

  @Get('admin/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async adminList() {
    return this.couponsService.findAllAdmin();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.couponsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async create(@Body() data: Partial<Coupon>) {
    return this.couponsService.create(data);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: Partial<Coupon>,
  ) {
    return this.couponsService.update(id, data);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.couponsService.remove(id);

    return {
      message: 'Xóa coupon thành công',
    };
  }

  @Post('validate')
  @UseGuards(JwtAuthGuard)
  async validateCoupon(
    @Body()
    body: ValidateCouponDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.couponsService.validateCoupon(
      body.code,
      Number(body.orderAmount),
      user.id,
      body.productId,
    );
  }
}
