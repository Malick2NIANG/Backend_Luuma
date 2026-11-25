import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Address, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

/**
 * Carnet d'adresses du client.
 *
 * La table existait depuis le début sans jamais être exposée : on retapait
 * son adresse à chaque commande, et la liste des GP demandait la ville à la
 * main alors que l'application aurait pu la connaître.
 *
 * Invariant tenu ici, et nulle part ailleurs : AU PLUS UNE adresse par défaut
 * par compte, et AU MOINS une tant qu'il en reste. Sans la seconde moitié,
 * supprimer son adresse par défaut laisserait un carnet plein dont aucune
 * entrée ne serait proposée — l'application redemanderait tout, avec des
 * adresses enregistrées sous les yeux.
 */
@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Par défaut en tête : c'est celle qu'on propose, elle se voit d'abord. */
  async listOwn(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: string, dto: CreateAddressDto): Promise<Address> {
    const count = await this.prisma.address.count({ where: { userId } });

    // La première adresse est forcément celle par défaut : personne ne pense
    // à cocher une case quand il n'y a rien d'autre à choisir.
    const isDefault = count === 0 ? true : (dto.isDefault ?? false);

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) await this.clearDefault(tx, userId);

      return tx.address.create({
        data: {
          userId,
          label: dto.label.trim(),
          address: dto.address.trim(),
          city: dto.city.trim(),
          country: dto.country.toUpperCase(),
          postCode: dto.postCode?.trim() || null,
          isDefault,
        },
      });
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateAddressDto,
  ): Promise<Address> {
    const existing = await this.getOwnOrThrow(id, userId);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) await this.clearDefault(tx, userId);

      return tx.address.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.address !== undefined ? { address: dto.address.trim() } : {}),
          ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
          ...(dto.country !== undefined
            ? { country: dto.country.toUpperCase() }
            : {}),
          ...(dto.postCode !== undefined
            ? { postCode: dto.postCode.trim() || null }
            : {}),
          // Retirer le statut par défaut sans en désigner un autre laisserait
          // le carnet sans adresse proposée : on ignore donc `false`, seul
          // `true` sur une AUTRE adresse déplace le statut.
          ...(dto.isDefault === true ? { isDefault: true } : {}),
        },
      });
    });
  }

  async remove(id: string, userId: string): Promise<{ id: string }> {
    const address = await this.getOwnOrThrow(id, userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      // Supprimer celle par défaut doit en désigner une autre, sinon le
      // carnet reste plein mais plus rien n'est proposé au paiement.
      if (address.isDefault) {
        const next = await tx.address.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
        });
        if (next) {
          await tx.address.update({
            where: { id: next.id },
            data: { isDefault: true },
          });
        }
      }
    });

    return { id };
  }

  private async getOwnOrThrow(id: string, userId: string): Promise<Address> {
    const address = await this.prisma.address.findUnique({ where: { id } });

    if (!address) throw new NotFoundException('Adresse introuvable.');
    // Propriété vérifiée ici plutôt que par un `where` combiné : un 403 dit
    // « pas à vous », un 404 dirait « n'existe pas ». Les deux cas méritent
    // des réponses différentes.
    if (address.userId !== userId) {
      throw new ForbiddenException("Cette adresse ne vous appartient pas.");
    }

    return address;
  }

  /** Retire le statut par défaut, sur la transaction en cours. */
  private async clearDefault(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await tx.address.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }
}
