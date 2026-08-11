import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      service: 'airline-flight-scheduling-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
