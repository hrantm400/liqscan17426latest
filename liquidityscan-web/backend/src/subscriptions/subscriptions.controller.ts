import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { AdminGuard } from '../admin/guards/admin.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @Public()
  findAll() {
    return this.subscriptionsService.findAll();
  }

  @Get('stats')
  @UseGuards(AdminGuard)
  getStats() {
    return this.subscriptionsService.getStats();
  }

  @Get('user/me')
  getMySubscription(@Request() req) {
    return this.subscriptionsService.getUserSubscription(req.user.userId);
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string) {
    return this.subscriptionsService.findOnePublicCatalog(id);
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() createSubscriptionDto: CreateSubscriptionDto) {
    return this.subscriptionsService.create(createSubscriptionDto);
  }

  @Put(':id')
  @UseGuards(AdminGuard)
  update(@Param('id') id: string, @Body() updateSubscriptionDto: UpdateSubscriptionDto) {
    return this.subscriptionsService.update(id, updateSubscriptionDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  remove(@Param('id') id: string) {
    return this.subscriptionsService.remove(id);
  }

  @Post(':id/subscribe')
  subscribe(@Param('id') id: string, @Request() req) {
    return this.subscriptionsService.assignSubscription(req.user.userId, id);
  }
}
