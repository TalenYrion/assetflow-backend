import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Asset } from './asset.entity';

@Entity()
export class Thumbnail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  url: string;

  @Column({ default: 200 })
  width: number;

  @Column({ default: 200 })
  height: number;

  @Column()
  storagePath: string;

  @OneToOne(() => Asset, (asset) => asset.thumbnail, { onDelete: 'CASCADE' })
  @JoinColumn()
  asset: Asset;
}
