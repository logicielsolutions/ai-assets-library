import { describe, expect, test } from 'claude-code/testing'

import { entropy, findSecrets, isEnvFile, isSecretHome, lineOf, looksSecret, mask, newRegistry, parseEnv, redact } from './detect'

// Fake values in real formats; none of these are live credentials.
const AWS = 'AKIAIOSFODNN7EXAMPLE'
const GH = `ghp_${'a1B2c3D4e5F6g7H8i9J0'.repeat(2)}`
const SLACK = 'xoxb-1234567890-abcdefghijkl'
const STRIPE = `sk_${'live'}_51Habcdefghijklmnop1234`
const ANTHROPIC = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123'
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234\n-----END RSA PRIVATE KEY-----'

const labels = (text: string, known: string[] = []) => findSecrets(text, known).map(f => f.label)

describe('formats', () => {
  test('known token formats', () => {
    expect(labels(`key ${AWS} here`)).toEqual(['aws-access-key'])
    expect(labels(`t=${GH}`)).toEqual(['github-token'])
    expect(labels(`slack ${SLACK}`)).toEqual(['slack-token'])
    expect(labels(`pay ${STRIPE}`)).toEqual(['stripe-key'])
    expect(labels(`k ${ANTHROPIC}`)).toEqual(['anthropic-key'])
    expect(labels(`jwt ${JWT}`)).toEqual(['jwt'])
    expect(labels(`pem\n${PEM}\nend`)).toEqual(['private-key'])
  })
  test('url password and bearer token redact only the secret part', () => {
    const t = 'postgres://app:S3cr3tPass@db.internal:5432/main'
    const [f] = findSecrets(t)
    expect(f?.label).toBe('url-password')
    expect(f?.value).toBe('S3cr3tPass')
    expect(labels('Authorization: Bearer abcdEFGH1234ijklMNOP5678')).toEqual(['bearer-token'])
  })
  test('named assignments need a secret-looking value', () => {
    expect(labels('password = "Zx9!qL2#vB7mK4pR"')).toEqual(['credential'])
    expect(labels('API_KEY=a8f3k2n9x1q7z4m6')).toEqual(['credential'])
    expect(labels('password=changeme')).toEqual([])
    expect(labels('token: ${GITHUB_TOKEN}')).toEqual([])
    expect(labels('secret = process.env.SECRET_NAME')).toEqual([])
    expect(labels('password=12345678')).toEqual(['credential'])
    expect(labels('token_count=12345678')).toEqual([])
  })
  test('ordinary text and code stay untouched', () => {
    expect(labels('const user = getUser(id); // fetch the token count for the page')).toEqual([])
    expect(labels('see https://example.com/docs and the key points')).toEqual([])
  })
})

describe('exact match, redaction, helpers', () => {
  test('known .env values are caught anywhere', () => {
    const known = ['hunter2hunter2']
    expect(labels('my db pw is hunter2hunter2 ok', known)).toEqual(['env-secret'])
    expect(findSecrets('a hunter2hunter2 b hunter2hunter2', known)).toHaveLength(2)
  })
  test('redaction removes the value and keeps tags stable', () => {
    const reg = newRegistry()
    const t1 = `use ${AWS} and ${GH}`
    const out1 = redact(t1, findSecrets(t1), reg)
    expect(out1).not.toContain(AWS)
    expect(out1).not.toContain(GH)
    expect(out1).toContain('[REDACTED:aws-access-key #1]')
    const out2 = redact(`again ${AWS}`, findSecrets(`again ${AWS}`), reg)
    expect(out2).toContain('[REDACTED:aws-access-key #1]')
  })
  test('allowed values are skipped', () => expect(findSecrets(`k ${AWS}`, [], new Set([AWS]))).toEqual([]))
  test('overlapping hits keep the longer one', () => {
    const t = `password = "${AWS}"`
    expect(findSecrets(t).map(f => f.value)).toEqual([AWS])
  })
  test('parseEnv learns secret-looking values only', () => {
    const env = 'PORT=3000\nNODE_ENV=production\nDB_PASSWORD="Zx9qL2vB7mK4pR1"\nAPI_URL=http://localhost\nRANDOM=aB3dE5gH7jK9mN1pQ3sT\nNAME=changeme123\n'
    expect(parseEnv(env)).toEqual(['Zx9qL2vB7mK4pR1', 'aB3dE5gH7jK9mN1pQ3sT'])
  })
  test('file name helpers', () => {
    expect(isEnvFile('.env')).toBe(true)
    expect(isEnvFile('.env.local')).toBe(true)
    expect(isEnvFile('.env.example')).toBe(false)
    expect(isSecretHome('/a/b/.env.production')).toBe(true)
    expect(isSecretHome('/a/b/config.ts')).toBe(false)
  })
  test('mask, lineOf, entropy, looksSecret', () => {
    expect(mask(AWS)).toBe('AKI…(20 chars)')
    expect(lineOf('a\nb\nc', 4)).toBe(3)
    expect(entropy('aaaa')).toBe(0)
    expect(looksSecret('Zx9!qL2#vB7mK4pR')).toBe(true)
    expect(looksSecret('aaaaaaaaaaaaaaaa')).toBe(false)
  })
})

describe('spoken-style credentials', () => {
  test('catches statements with a value that looks like a secret', () => {
    expect(labels('my api key is 697979kl')).toEqual(['credential'])
    expect(labels('my password is hunter2')).toEqual(['credential'])
    expect(labels('the pin is 4821')).toEqual(['credential'])
    expect(labels('token: Ab3dEf9h')).toEqual(['credential'])
    expect(labels('password is correct-Horse_9')).toEqual(['credential'])
    expect(labels('My API key is 123456.')).toEqual(['credential'])
    expect(labels('the token is 987654321')).toEqual(['credential'])
  })
  test('redacts only the value, not the sentence', () => {
    const t = 'my api key is 697979kl, thanks'
    const [f] = findSecrets(t)
    expect(f?.value).toBe('697979kl')
    expect(redact(t, findSecrets(t), newRegistry())).toBe('my api key is [REDACTED:credential #1], thanks')
  })
  test('ordinary sentences stay untouched', () => {
    for (const t of [
      'the token is expired',
      'password is required to log in',
      'my api key is missing',
      'the secret is out',
      'the pin is 12',
      'my api key is 12345',
      'the token count is 4096',
      'secret is in the vault',
      'token is valid.',
    ]) expect(labels(t)).toEqual([])
  })
})
