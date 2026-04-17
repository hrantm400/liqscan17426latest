import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(private prisma: PrismaService) { }

  async findAll() {
    return this.prisma.subscription.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Public pricing page: plan fields only (no subscriber counts). */
  async findOnePublicCatalog(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return subscription;
  }

  async findOne(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription with ID ${id} not found`);
    }

    return subscription;
  }

  async create(data: CreateSubscriptionDto) {
    // Validate tier
    const validTiers = ['SCOUT', 'FULL_ACCESS'];
    if (!validTiers.includes(data.tier)) {
      throw new BadRequestException(`Invalid tier. Must be: SCOUT (Free Forever) or FULL_ACCESS (Full Access)`);
    }

    return this.prisma.subscription.create({
      data: {
        name: data.name,
        description: data.description,
        tier: data.tier,
        tierNumber: data.tierNumber,
        price: data.priceMonthly, // legacy field
        priceMonthly: data.priceMonthly,
        priceYearly: data.priceYearly,
        duration: data.duration || 30,
        markets: data.markets ? JSON.parse(JSON.stringify(data.markets)) : null,
        pairsLimit: data.pairsLimit,
        timeframes: data.timeframes ? JSON.parse(JSON.stringify(data.timeframes)) : null,
        signalTypes: data.signalTypes ? JSON.parse(JSON.stringify(data.signalTypes)) : null,
        features: data.features ? JSON.parse(JSON.stringify(data.features)) : null,
        limits: data.limits ? JSON.parse(JSON.stringify(data.limits)) : null,
        isPopular: data.isPopular || false,
        isActive: data.isActive !== undefined ? data.isActive : true,
        sortOrder: data.sortOrder || 0,
      },
    });
  }

  async update(id: string, data: UpdateSubscriptionDto) {
    const subscription = await this.findOne(id);

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.tier !== undefined) {
      const validTiers = ['SCOUT', 'FULL_ACCESS'];
      if (!validTiers.includes(data.tier)) {
        throw new BadRequestException(`Invalid tier. Must be: SCOUT (Free Forever) or FULL_ACCESS (Full Access)`);
      }
      updateData.tier = data.tier;
    }
    if (data.tierNumber !== undefined) updateData.tierNumber = data.tierNumber;
    if (data.priceMonthly !== undefined) {
      updateData.price = data.priceMonthly; // legacy field
      updateData.priceMonthly = data.priceMonthly;
    }
    if (data.priceYearly !== undefined) updateData.priceYearly = data.priceYearly;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.markets !== undefined) updateData.markets = JSON.parse(JSON.stringify(data.markets));
    if (data.pairsLimit !== undefined) updateData.pairsLimit = data.pairsLimit;
    if (data.timeframes !== undefined) updateData.timeframes = JSON.parse(JSON.stringify(data.timeframes));
    if (data.signalTypes !== undefined) updateData.signalTypes = JSON.parse(JSON.stringify(data.signalTypes));
    if (data.features !== undefined) updateData.features = JSON.parse(JSON.stringify(data.features));
    if (data.limits !== undefined) updateData.limits = JSON.parse(JSON.stringify(data.limits));
    if (data.isPopular !== undefined) updateData.isPopular = data.isPopular;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.sortOrder !== undefined) updateData.sortOrder = data.sortOrder;

    return this.prisma.subscription.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: string) {
    const subscription = await this.findOne(id);

    // Check if any users are using this subscription
    const userCount = await this.prisma.user.count({
      where: { subscriptionId: id },
    });

    if (userCount > 0) {
      throw new BadRequestException(`Cannot delete subscription. ${userCount} user(s) are currently subscribed.`);
    }

    return this.prisma.subscription.delete({
      where: { id },
    });
  }

  async getUserSubscription(userId: string) {
    if (!userId) {
      throw new NotFoundException('User not found');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscription: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Check if subscription is expired
    if (user.subscription && user.subscriptionExpiresAt) {
      const now = new Date();
      if (user.subscriptionExpiresAt < now && user.subscriptionStatus === 'active') {
        // Update status to expired
        await this.prisma.user.update({
          where: { id: userId },
          data: { subscriptionStatus: 'expired' },
        });
        user.subscriptionStatus = 'expired';
      }
    }

    return {
      subscription: user.subscription,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    };
  }

  async assignSubscription(userId: string, subscriptionId: string) {
    const subscription = await this.findOne(subscriptionId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + subscription.duration);

    // Update user subscription
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionId: subscriptionId,
        subscriptionStatus: 'active',
        subscriptionExpiresAt: expiresAt,
        tier: subscription.tier === 'FULL_ACCESS' ? 'PAID_MONTHLY' : 'FREE',
      },
      include: {
        subscription: true,
      },
    });

    // Create UserSubscription record for history
    await this.prisma.userSubscription.create({
      data: {
        userId: userId,
        subscriptionId: subscriptionId,
        startDate: new Date(),
        endDate: expiresAt,
        status: 'active',
      },
    });

    return updatedUser;
  }

  async getStats() {
    const subscriptions = await this.prisma.subscription.findMany({
      include: {
        _count: {
          select: {
            users: true,
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const totalUsers = await this.prisma.user.count({
      where: {
        subscriptionStatus: 'active',
      },
    });

    return {
      subscriptions: subscriptions.map((sub) => ({
        id: sub.id,
        name: sub.name,
        tier: sub.tier,
        userCount: sub._count.users,
      })),
      totalActiveSubscriptions: totalUsers,
    };
  }
}
