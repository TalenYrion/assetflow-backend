import { Role } from 'src/user/enums/role.enum';
import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import * as argon2 from 'argon2';
import { Asset } from './asset.entity';
import { Order } from './order.entity';
import { OnboardingStatus } from 'src/user/enums/onboarding.enum';

@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstName: string;

  @Column({nullable: true})
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  bio: string;

  @Column({ nullable: true, select: false })
  password: string;

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.BUYER,
  })
  role: Role;

  @ManyToMany(() => Asset)
  @JoinTable({
    name: 'wishlist',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'assetId', referencedColumnName: 'id' },
  })
  wishlist: Asset[];

  @OneToMany(() => Order, (order) => order.buyer)
  buyerOrders: Order[];

  @OneToMany(() => Order, (order) => order.seller)
  sellerOrders: Order[];

  @Column({ nullable: true, select: false, type: 'varchar' })
  refreshToken: string | null;

  @Column({ nullable: true, select: false, type: 'varchar' })
  stripeAccountId: string | null;

  @Column({
    type: 'enum',
    enum: OnboardingStatus,
    default: OnboardingStatus.PENDING,
  })
  onboardingStatus: OnboardingStatus;

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Asset, (asset) => asset.creator)
  assets: Asset[];

  @BeforeInsert()
  async hashPassword() {
    const hashedPassword = await argon2.hash(this.password);
    this.password = hashedPassword;
  }
}
