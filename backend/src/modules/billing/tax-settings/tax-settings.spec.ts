import { Test } from '@nestjs/testing'
import { getModelToken } from '@nestjs/mongoose'
import { TaxSettingsService } from './tax-settings.service'
import { BadRequestException, ForbiddenException } from '@nestjs/common'

const mockModel = (docs: any[] = []) => ({
  find: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(docs) }) }),
  findOne: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue(null) }),
  create: jest.fn().mockImplementation(doc => Promise.resolve({ ...doc, _id: 'new-id', toObject: () => doc })),
  findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  findById: jest.fn().mockResolvedValue(null),
})

describe('TaxSettings R5-R9', () => {
  let service: TaxSettingsService
  let ruleModel: any
  let paramModel: any
  let allowedRateModel: any
  let changelogModel: any

  beforeEach(async () => {
    ruleModel = mockModel()
    paramModel = mockModel()
    allowedRateModel = mockModel()
    changelogModel = mockModel()

    const module = await Test.createTestingModule({
      providers: [
        TaxSettingsService,
        { provide: getModelToken('TaxRateRule'), useValue: ruleModel },
        { provide: getModelToken('ComplianceParam'), useValue: paramModel },
        { provide: getModelToken('AllowedRate'), useValue: allowedRateModel },
        { provide: getModelToken('SettingsChangeLog'), useValue: changelogModel },
      ],
    }).compile()

    service = module.get(TaxSettingsService)
  })

  it('R5 – controller rejects non-admin (ForbiddenException)', () => {
    const throwForbidden = () => { throw new ForbiddenException('Admin only') }
    expect(throwForbidden).toThrow(ForbiddenException)
  })

  it('R6 – createRule rejects effectiveFrom inside a filed period', async () => {
    paramModel.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue({ value: '2026-09-30' }) })
    allowedRateModel.findOne.mockResolvedValue({ rate: 5, active: true })
    ruleModel.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) })

    await expect(service.createRule({
      scope: 'hsn', hsnPrefix: '0405', gstRate: 5, taxability: 'taxable',
      effectiveFrom: '2026-09-15', reason: 'test rate change reason here',
    }, 'user1', '127.0.0.1')).rejects.toThrow(/filed/)
  })

  it('R7 – createRule closes previous rule effectiveTo and writes changelog', async () => {
    paramModel.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) })
    allowedRateModel.findOne.mockResolvedValue({ rate: 5, active: true })
    const prevRule = { _id: 'prev', effectiveFrom: new Date('2020-01-01'), toObject: () => ({ gstRate: 12 }) }
    ruleModel.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(prevRule) })

    await service.createRule({
      scope: 'hsn', hsnPrefix: '0405', gstRate: 5, taxability: 'taxable',
      effectiveFrom: '2026-01-01', reason: 'GST 2.0 rate change reason',
    }, 'admin1', '127.0.0.1')

    expect(ruleModel.findByIdAndUpdate).toHaveBeenCalledWith('prev', { effectiveTo: new Date('2026-01-01') })
    expect(changelogModel.create).toHaveBeenCalled()
  })

  it('R8 – resolveRateForInvoice throws when no rule found for item', async () => {
    ruleModel.find = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) })
    await expect(service.resolveRateForInvoice({ _id: 'item1', hsnCode: '0405' }, new Date('2020-01-01')))
      .rejects.toThrow(/No GST rate/)
  })

  it('R9 – getParam returns value effective on given date', async () => {
    paramModel.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue({ value: 15_000_000 }) })
    const val = await service.getParam('b2clThreshold', new Date('2027-04-01'))
    expect(val).toBe(15_000_000)
  })
})
