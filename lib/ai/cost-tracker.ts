import { db, schema } from '@/lib/db'
import crypto from 'crypto'

const PRICE_INPUT_PER_TOKEN  = 3.00  / 1_000_000
const PRICE_OUTPUT_PER_TOKEN = 15.00 / 1_000_000

function getUsdBrlRate(): number {
  const rate = parseFloat(process.env.USD_BRL_RATE ?? '5.8')
  return isNaN(rate) ? 5.8 : rate
}

export function calcCost(inputTokens: number, outputTokens: number) {
  const usd = inputTokens * PRICE_INPUT_PER_TOKEN + outputTokens * PRICE_OUTPUT_PER_TOKEN
  const brl = usd * getUsdBrlRate()
  return { usd, brl }
}

export interface LogUsageParams {
  companyId:        string
  managerId?:       string
  investigationId?: string
  operation:        'investigation_engine' | 'report_generator'
  model:            string
  inputTokens:      number
  outputTokens:     number
}

export async function logUsage(params: LogUsageParams): Promise<void> {
  const { usd, brl } = calcCost(params.inputTokens, params.outputTokens)
  try {
    await db.insert(schema.api_usage_logs).values({
      id:               crypto.randomUUID(),
      company_id:       params.companyId,
      manager_id:       params.managerId ?? null,
      investigation_id: params.investigationId ?? null,
      operation:        params.operation,
      model:            params.model,
      input_tokens:     params.inputTokens,
      output_tokens:    params.outputTokens,
      cost_usd:         usd,
      cost_brl:         brl,
    })
  } catch (err) {
    console.error('[cost-tracker] failed to log usage (non-fatal)', err)
  }
}
