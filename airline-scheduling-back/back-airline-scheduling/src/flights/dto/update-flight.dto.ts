import { PartialType } from '@nestjs/mapped-types'; // ou '@nestjs/swagger' si vous utilisez Swagger
import { CreateFlightDto } from './create-flight.dto';

export class UpdateFlightDto extends PartialType(CreateFlightDto) {}