import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class OAuthExchangeDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  code!: string;
}
