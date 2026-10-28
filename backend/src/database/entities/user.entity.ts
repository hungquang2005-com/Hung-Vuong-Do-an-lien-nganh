// file định nghĩa entity user và ánh xạ dữ liệu của entity này với bảng trong database.
import { Column, CreateDateColumn, Entity, OneToMany, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Cart } from './cart.entity';
import { UserRole } from './enums';
import { Order } from './order.entity';

export enum UserGender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ name: 'full_name', length: 100 })
  fullName: string;

  @Column({ type: 'varchar', length: 50, unique: true, nullable: true })
  username: string | null;

  @Column({ length: 100, unique: true })
  email: string;

  @Column({ length: 255 })
  password: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  phone: string | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'enum', enum: UserGender, nullable: true })
  gender: UserGender | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ name: 'card_holder', type: 'varchar', length: 100, nullable: true })
  cardHolder: string | null;

  @Column({ name: 'card_type', type: 'varchar', length: 20, nullable: true })
  cardType: string | null;

  @Column({ name: 'card_provider', type: 'varchar', length: 40, nullable: true })
  cardProvider: string | null;

  @Column({ name: 'card_last4', type: 'char', length: 4, nullable: true })
  cardLast4: string | null;

  @Column({ name: 'card_exp_month', type: 'tinyint', unsigned: true, nullable: true })
  cardExpMonth: number | null;

  @Column({ name: 'card_exp_year', type: 'smallint', unsigned: true, nullable: true })
  cardExpYear: number | null;

  @Column({ name: 'transaction_pin_hash', type: 'varchar', length: 255, nullable: true })
  transactionPinHash: string | null;

  @Column({ name: 'transaction_pin_failed_attempts', type: 'tinyint', unsigned: true, default: 0 })
  transactionPinFailedAttempts: number;

  @Column({ name: 'transaction_pin_locked_until', type: 'datetime', nullable: true })
  transactionPinLockedUntil: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
  updatedAt: Date;

  @OneToOne(() => Cart, (cart) => cart.user)
  cart: Cart;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];
}
