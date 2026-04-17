import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SignalsService } from './signals.service';

@Injectable()
export class PositionTrackerService implements OnModuleInit {
    private readonly logger = new Logger(PositionTrackerService.name);

    constructor(private readonly signalsService: SignalsService) { }

    onModuleInit() {
        this.logger.log('PositionTrackerService initialized (logic temporarily disabled pending new rules).');
    }

    async trackActiveSignals() {
        // Logic removed as requested
    }
}
