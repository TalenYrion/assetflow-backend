import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { Public } from 'src/auth/decorators/public.decorator';
import { Roles } from 'src/auth/decorators/role.decorator';
import { Role } from 'src/user/enums/role.enum';
import { OrderQueryDto } from './dto/orderQuery.dto';

@Controller('order')
export class OrderController {
  constructor(private orderService: OrderService) {}

  @Public()
  @Post('webhook/standard')
  async standardWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    return this.orderService.handleStandardWebhook(req.rawBody, signature);
  }

  @Public()
  @Post('webhook/connect')
  async connectWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Missing raw request body');
    }

    return this.orderService.handleConnectWebhook(req.rawBody, signature);
  }

  @Roles(Role.BUYER)
  @Post('upgradeToSeller')
  upgradeToSeller(@Req() req) {
    return this.orderService.upgradeToSeller(req.user.id);
  }

  @Get('buyer-history')
  async getBuyerHistory(@Req() req, @Query() query: OrderQueryDto) {
    const pageNum = Math.max(1, query.page);
    let limitNum = query.limit;
    const allowedLimits = [10, 25, 50];
    if (!allowedLimits.includes(limitNum)) {
      limitNum = 10;
    }
    return this.orderService.getBuyerOrderHistory(
      req.user.id,
      pageNum,
      limitNum,
    );
  }

  @Roles(Role.SELLER)
  @Get('seller-dashboard')
  async getSellerDashboard(@Req() req, @Query() query: OrderQueryDto) {
    const pageNum = Math.max(1, query.page);
    let limitNum = query.limit;
    const allowedLimits = [10, 25, 50];
    if (!allowedLimits.includes(limitNum)) {
      limitNum = 10;
    }

    return this.orderService.getSellerDashboard(req.user.id, pageNum, limitNum);
  }

  @Get('stripe-portal')
  async getStripePortal(@Req() req: any) {
    // Extract user metadata appended from your JWT authentication strategy
    const userId = req.user?.id;

    if (!userId) {
      throw new BadRequestException('Invalid user request context');
    }

    return await this.orderService.getStripeLoginLink(userId);
  }
}
