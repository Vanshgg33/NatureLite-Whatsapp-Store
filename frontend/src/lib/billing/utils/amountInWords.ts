const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function words(n: number): string {
  if (n === 0) return ''
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + words(n % 100) : '')
}

/** Converts paise integer to Indian amount-in-words. E.g. 94650 → "Rupees Nine Hundred Forty Six and Fifty Paise Only" */
export function amountInWords(paise: number): string {
  const rs = Math.floor(paise / 100)
  const p  = paise % 100
  if (rs === 0 && p === 0) return 'Rupees Zero Only'

  const parts: string[] = []
  const cr = Math.floor(rs / 1_00_00_000);    if (cr) parts.push(words(cr) + ' Crore')
  const lk = Math.floor((rs % 1_00_00_000) / 1_00_000); if (lk) parts.push(words(lk) + ' Lakh')
  const th = Math.floor((rs % 1_00_000) / 1_000);        if (th) parts.push(words(th) + ' Thousand')
  const rm = rs % 1_000;                                  if (rm) parts.push(words(rm))

  let result = ''
  if (rs > 0) result = 'Rupees ' + parts.join(' ')
  if (p > 0)  result += (rs > 0 ? ' and ' : 'Rupees ') + words(p) + ' Paise'
  return result + ' Only'
}
