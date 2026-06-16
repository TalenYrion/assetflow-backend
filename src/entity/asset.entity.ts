import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Thumbnail } from './thumbnail.entity';

export enum AssetStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
  BANNED = 'BANNED',
}

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ nullable: true })
  fileExtension: string;

  @ManyToOne(() => User, (user) => user.assets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creatorId' })
  creator: User;

  @OneToOne(() => Thumbnail, (thumbnail) => thumbnail.asset, {
    cascade: true,
    nullable: true,
  })
  @JoinColumn()
  thumbnail: Thumbnail | null;

  @Column()
  creatorId: number;

  @Column({ type: 'enum', enum: AssetStatus, default: AssetStatus.DRAFT })
  status: AssetStatus;

  @Column()
  storagePath: string;

  @DeleteDateColumn()
  deletedAt: Date;

  @UpdateDateColumn()
  updateAT: Date;

  @CreateDateColumn({nullable: true})
  createdAt: Date | null;
}
