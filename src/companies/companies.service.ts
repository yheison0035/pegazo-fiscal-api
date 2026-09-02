import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DocumentType } from '@prisma/client';
import { PrismaService } from '@/common/prisma.service';
import { CryptoService } from '@/common/crypto.service';
import {
  CreateCompanyDto,
  CreateResolutionDto,
  UploadCertificateDto,
} from './dto/company.dto';

/** Campos del certificado que NUNCA se exponen por la API. */
const SAFE_SELECT = {
  id: true,
  nit: true,
  dv: true,
  legalName: true,
  tradeName: true,
  externalId: true,
  env: true,
  habilitacion: true,
  softwareId: true,
  certExpiresAt: true,
  active: true,
  createdAt: true,
};

@Injectable()
export class CompaniesService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async create(platformId: string, dto: CreateCompanyDto) {
    const exists = await this.prisma.company.findUnique({
      where: { platformId_nit: { platformId, nit: dto.nit } },
      select: { id: true },
    });
    if (exists)
      throw new BadRequestException('Ya existe una empresa con ese NIT en esta plataforma.');

    return this.prisma.company.create({
      data: { platformId, ...dto },
      select: SAFE_SELECT,
    });
  }

  async get(platformId: string, id: string) {
    const company = await this.prisma.company.findFirst({
      where: { id, platformId },
      select: { ...SAFE_SELECT, resolutions: true },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada.');
    return company;
  }

  async list(platformId: string) {
    return this.prisma.company.findMany({
      where: { platformId },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Guarda el certificado .p12 y su clave CIFRADOS en reposo. */
  async uploadCertificate(
    platformId: string,
    id: string,
    dto: UploadCertificateDto,
  ) {
    await this.assertOwned(platformId, id);
    const p12 = Buffer.from(dto.p12Base64, 'base64');
    if (p12.length === 0) throw new BadRequestException('El .p12 esta vacio.');

    await this.prisma.company.update({
      where: { id },
      data: {
        certEncrypted: Uint8Array.from(this.crypto.encrypt(p12)),
        certPassEnc: Uint8Array.from(this.crypto.encryptString(dto.password)),
        certExpiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    return { success: true, message: 'Certificado guardado y cifrado.' };
  }

  async addResolution(
    platformId: string,
    id: string,
    dto: CreateResolutionDto,
  ) {
    await this.assertOwned(platformId, id);
    const type = dto.documentType as DocumentType;
    if (!Object.values(DocumentType).includes(type))
      throw new BadRequestException('Tipo de documento invalido.');

    return this.prisma.numberingResolution.create({
      data: {
        companyId: id,
        documentType: type,
        prefix: dto.prefix,
        resolution: dto.resolution,
        technicalKey: dto.technicalKey,
        rangeFrom: dto.rangeFrom,
        rangeTo: dto.rangeTo,
        current: dto.rangeFrom,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
      },
    });
  }

  private async assertOwned(platformId: string, id: string) {
    const c = await this.prisma.company.findFirst({
      where: { id, platformId },
      select: { id: true },
    });
    if (!c) throw new NotFoundException('Empresa no encontrada.');
  }
}
