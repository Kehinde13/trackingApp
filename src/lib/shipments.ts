import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { ShipmentStatus, TrackingEventSource } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  generateUniqueShipmentReference,
  PACKAGE_PAGE_SIZE,
  type PackageSearchParams,
} from "@/lib/shipment-domain";
import { isUniqueReferenceError } from "@/lib/shipment-errors";
import type {
  CreatePackageInput,
  EditPackageInput,
} from "@/lib/shipment-validation";
import { generatePublicTrackingToken } from "@/lib/tracking-token";

const IN_TRANSIT_STATUSES = [
  ShipmentStatus.PICKED_UP,
  ShipmentStatus.IN_TRANSIT,
  ShipmentStatus.CUSTOMS,
  ShipmentStatus.OUT_FOR_DELIVERY,
];

const ATTENTION_STATUSES = [ShipmentStatus.DELAYED, ShipmentStatus.EXCEPTION];

export async function getShipmentDashboardStats() {
  const [total, pending, inTransit, delivered, attention] = await prisma.$transaction([
    prisma.shipment.count(),
    prisma.shipment.count({ where: { status: ShipmentStatus.PENDING } }),
    prisma.shipment.count({ where: { status: { in: IN_TRANSIT_STATUSES } } }),
    prisma.shipment.count({ where: { status: ShipmentStatus.DELIVERED } }),
    prisma.shipment.count({ where: { status: { in: ATTENTION_STATUSES } } }),
  ]);

  return { total, pending, inTransit, delivered, attention };
}

function buildShipmentWhere(filters: PackageSearchParams): Prisma.ShipmentWhereInput {
  const where: Prisma.ShipmentWhereInput = {};

  if (filters.query) {
    where.OR = [
      { reference: { contains: filters.query, mode: "insensitive" } },
      { recipientName: { contains: filters.query, mode: "insensitive" } },
      { trackingNumber: { contains: filters.query, mode: "insensitive" } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.carrier) where.carrierCode = filters.carrier;

  return where;
}

export async function listShipments(filters: PackageSearchParams) {
  const where = buildShipmentWhere(filters);
  const [total, shipments] = await prisma.$transaction([
    prisma.shipment.count({ where }),
    prisma.shipment.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (filters.page - 1) * PACKAGE_PAGE_SIZE,
      take: PACKAGE_PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        recipientName: true,
        carrierCode: true,
        carrierName: true,
        trackingNumber: true,
        status: true,
        destinationCity: true,
        destinationCountryCode: true,
        updatedAt: true,
      },
    }),
  ]);

  return {
    shipments,
    total,
    totalPages: Math.max(1, Math.ceil(total / PACKAGE_PAGE_SIZE)),
  };
}

export async function listCarrierFilters() {
  const carriers = await prisma.shipment.findMany({
    where: { carrierCode: { not: null } },
    distinct: ["carrierCode"],
    orderBy: { carrierCode: "asc" },
    select: { carrierCode: true, carrierName: true },
  });

  return carriers.filter(
    (carrier): carrier is { carrierCode: string; carrierName: string | null } =>
      carrier.carrierCode !== null,
  );
}

export async function getShipmentDetails(id: string) {
  return prisma.shipment.findUnique({
    where: { id },
    select: {
      id: true,
      publicToken: true,
      reference: true,
      recipientName: true,
      carrierCode: true,
      carrierName: true,
      trackingNumber: true,
      status: true,
      originCity: true,
      originCountryCode: true,
      destinationCity: true,
      destinationCountryCode: true,
      estimatedDeliveryAt: true,
      deliveredAt: true,
      createdAt: true,
      updatedAt: true,
      trackingEvents: {
        orderBy: { occurredAt: "asc" },
        select: {
          id: true,
          source: true,
          status: true,
          description: true,
          location: true,
          city: true,
          countryCode: true,
          occurredAt: true,
          createdAt: true,
        },
      },
    },
  });
}

export async function createShipmentWithInitialEvent(input: CreatePackageInput) {
  const suppliedReference = input.reference;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const reference =
      suppliedReference ??
      (await generateUniqueShipmentReference(async (candidate) => {
        const existing = await prisma.shipment.findUnique({
          where: { reference: candidate },
          select: { id: true },
        });
        return existing !== null;
      }));

    try {
      return await prisma.$transaction(async (transaction) =>
        transaction.shipment.create({
          data: {
            ...input,
            reference,
            publicToken: generatePublicTrackingToken(),
            status: ShipmentStatus.PENDING,
            trackingEvents: {
              create: {
                source: TrackingEventSource.SYSTEM,
                status: ShipmentStatus.PENDING,
                description: "Shipment created",
                occurredAt: new Date(),
              },
            },
          },
          select: { id: true, reference: true, publicToken: true },
        }),
      );
    } catch (error: unknown) {
      if (!suppliedReference && isUniqueReferenceError(error) && attempt < 5) continue;
      throw error;
    }
  }

  throw new Error("Unable to generate a unique package reference");
}

export async function updateShipmentMetadata(id: string, input: EditPackageInput) {
  return prisma.shipment.update({
    where: { id },
    data: input,
    select: { id: true },
  });
}
