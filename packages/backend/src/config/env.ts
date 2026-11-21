import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('*'),

  DATABASE_URL: z
    .string()
    .default('postgresql://popbox:popbox_dev_pass@localhost:5432/popbox?schema=public'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  JWT_SECRET: z
    .string()
    .min(16)
    .default('dev_jwt_secret_change_me_in_production_at_least_32_bytes_long'),
  POOL_SALT_ENCRYPTION_KEY: z
    .string()
    .length(64)
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),

  TELEGRAM_BOT_TOKEN: z.string().default(''),
  TELEGRAM_MINIAPP_URL: z.string().default('https://app.popbox.example'),

  BSC_CHAIN_ID: z.coerce.number().int().default(56),
  BSC_RPC_URL: z.string().default('https://bsc-dataseed.binance.org/'),
  POP_TOKEN_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0x0000000000000000000000000000000000000000'),
  POP_PRIMARY_SALE_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0x0000000000000000000000000000000000000000'),
  POP_CLAIM_VAULT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0x0000000000000000000000000000000000000000'),
  PANCAKE_V3_POOL_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0x0000000000000000000000000000000000000000'),
  PANCAKE_V3_NPM_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0x46A15B0b27311cedF172AB29E4f4766fbE7F4364'),

  HOT_CUSTODY_WALLET_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .default('0x0000000000000000000000000000000000000000'),
  HOT_CUSTODY_PRIVATE_KEY: z.string().default(''),
  CLAIM_SIGNER_PRIVATE_KEY: z.string().default(''),

  MARKET_FEE_BPS: z.coerce.number().int().min(300).max(500).default(400),
  TURNSTILE_SECRET_KEY: z.string().default(''),

  LLM_BASE_URL: z
    .string()
    .default('https://generativelanguage.googleapis.com/v1beta/openai'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('gemini-2.5-flash'),

  ENABLE_WORKERS: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export const env: EnvConfig = envSchema.parse(process.env);
