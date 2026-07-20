import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A user row — the Owner (ADR-0003) as persisted. Identity comes from Google
 * (ADR-0002): `googleSub` is Google's stable subject id and the unique key we
 * upsert on. `id` is our own UUID and the `ownerId` every aggregate is scoped
 * to. `name`/`picture` are nullable — Google only supplies them with the
 * relevant scopes.
 */
@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'google_sub', type: 'text' })
  googleSub!: string;

  @Column({ type: 'text' })
  email!: string;

  @Column({ type: 'text', nullable: true })
  name!: string | undefined;

  @Column({ type: 'text', nullable: true })
  picture!: string | undefined;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
