// file-type.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('file_types')
export class FileType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  extension: string; // e.g., "png", "fbx", "zip"

  @Column({ nullable: true })
  mimeType: string; // e.g., "image/png"

  @Column({ default: true })
  isActive: boolean; // Use this to "ban" or "allow" certain types later

  @CreateDateColumn()
  createdAt: Date;
}
