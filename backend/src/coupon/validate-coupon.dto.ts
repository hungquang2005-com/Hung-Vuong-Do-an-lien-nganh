import { IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class ValidateCouponDto {
  @IsString()
  @Matches(/\S/)
  @MaxLength(50)
  code: string;

  @IsNumber()
  @Min(0)
  orderAmount: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  productId?: number;
}
