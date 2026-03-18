import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AdminModule } from '../admin/admin.module';
import { UsersModule } from '../users/users.module';
import { StoresModule } from '../stores/stores.module';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema';
import { RefreshTokenRepository } from './repositories/refresh-token.repository';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          expiresIn: configService.get<string>('jwt.expiresIn'),
        },
      }),
    }),
    AdminModule,
    UsersModule,
    StoresModule,
    MongooseModule.forFeature([{ name: RefreshToken.name, schema: RefreshTokenSchema }]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshTokenRepository],
  exports: [AuthService, JwtStrategy, PassportModule],
})
export class AuthModule {}
