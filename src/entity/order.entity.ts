import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Asset } from './asset.entity';
import { OrderStatus } from 'src/order/enum/orderStatus.enum';

@Entity('order')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  pricePaid: number;

  @Column()
  transactionId: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.SUCCESS })
  status: OrderStatus;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  platformFee: number;

  @CreateDateColumn()
  createdAt: Date;

@Column({ type: 'json', nullable: true })
  assetSnapshot: { title: string; description: string; fileExtension: string };

  @ManyToOne(() => User, (user) => user.buyerOrders)
  buyer: User;

  @ManyToOne(() => User, (user) => user.sellerOrders)
  seller: User;

  @ManyToOne(() => Asset)
  asset: Asset;
}
