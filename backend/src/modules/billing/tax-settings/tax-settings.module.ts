import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { TaxRateRule, TaxRateRuleSchema } from '../schemas/tax-rate-rule.schema'
import { ComplianceParam, ComplianceParamSchema } from '../schemas/compliance-param.schema'
import { AllowedRate, AllowedRateSchema } from '../schemas/allowed-rate.schema'
import { SettingsChangeLog, SettingsChangeLogSchema } from '../schemas/settings-changelog.schema'
import { TaxSettingsService } from './tax-settings.service'
import { TaxSettingsController } from './tax-settings.controller'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TaxRateRule.name, schema: TaxRateRuleSchema },
      { name: ComplianceParam.name, schema: ComplianceParamSchema },
      { name: AllowedRate.name, schema: AllowedRateSchema },
      { name: SettingsChangeLog.name, schema: SettingsChangeLogSchema },
    ]),
  ],
  controllers: [TaxSettingsController],
  providers: [TaxSettingsService],
  exports: [TaxSettingsService],
})
export class TaxSettingsModule {}
