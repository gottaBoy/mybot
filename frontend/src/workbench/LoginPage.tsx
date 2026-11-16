import { useState } from 'react'
import {
  ArrowRight,
  Command,
  KeyRound,
  Languages,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react'
import { AppBadge, AppButton, AppCard, AppInput } from '../components/ui'
import { ApiError, post } from './api'
import type { Copy } from './state'

export function LoginPage({
  t,
  mode,
  onModeChange,
  onLanguageChange,
  authenticated,
  onLogin,
}: {
  t: Copy
  mode: 'light' | 'dark'
  onModeChange: () => void
  onLanguageChange: () => void
  authenticated: boolean
  onLogin: () => Promise<void>
}) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="wb-auth-page">
      <header className="wb-auth-header">
        <a className="wb-brand" href="#workbench">
          <span className="wb-brand-symbol">
            <Command size={21} />
          </span>
          <strong>mybot</strong>
        </a>
        <div className="wb-inline">
          <AppButton
            label={t('Switch to English', '切换为中文')}
            icon={<Languages size={17} />}
            iconOnly
            tone="ghost"
            onClick={onLanguageChange}
          />
          <AppButton
            label={
              mode === 'light'
                ? t('切换深色', 'Dark mode')
                : t('切换浅色', 'Light mode')
            }
            icon={mode === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            iconOnly
            tone="ghost"
            onClick={onModeChange}
          />
        </div>
      </header>
      <main className="wb-auth-main">
        <div className="wb-auth-intro">
          <span className="wb-auth-symbol">
            <ShieldCheck size={25} />
          </span>
          <h1>
            {authenticated
              ? t('工作空间已连接', 'Workspace connected')
              : t('登录工作空间', 'Sign in to workspace')}
          </h1>
          <p>{t('研发工作空间', 'R&D workspace')}</p>
        </div>
        <AppCard className="wb-auth-card">
          {authenticated ? (
            <div className="wb-form">
              <AppBadge tone="success">
                {t('当前会话可用', 'Current session is active')}
              </AppBadge>
              <AppButton
                label={t('进入工作空间', 'Open workspace')}
                icon={<ArrowRight size={16} />}
                tone="primary"
                width="100%"
                href="#workbench"
              />
            </div>
          ) : (
            <form
              className="wb-form"
              onSubmit={async (event) => {
                event.preventDefault()
                if (busy || !token.trim()) return
                setBusy(true)
                setError('')
                try {
                  await post('/auth', { token })
                  setToken('')
                  await onLogin()
                } catch (reason) {
                  setError(
                    reason instanceof ApiError && reason.status === 401
                      ? t(
                          '访问令牌无效，请重新输入。',
                          'Invalid access token. Please try again.',
                        )
                      : reason instanceof ApiError && reason.status === 429
                        ? t(
                            '尝试次数过多，请稍后再试。',
                            'Too many attempts. Try again later.',
                          )
                        : reason instanceof Error
                          ? reason.message
                          : String(reason),
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              <div className="wb-auth-method">
                <KeyRound size={17} />
                <strong>{t('访问令牌', 'Access token')}</strong>
                <AppBadge>{t('本机 / 私有部署', 'Local / private')}</AppBadge>
              </div>
              <AppInput
                label={t('访问令牌', 'Access token')}
                type="password"
                value={token}
                onChange={(value) => {
                  setToken(value)
                  setError('')
                }}
                autoComplete="current-password"
                isRequired
                isDisabled={busy}
                hasAutoFocus
                status={error ? { type: 'error' } : undefined}
              />
              {error && (
                <p className="wb-error" role="alert">
                  {error}
                </p>
              )}
              <AppButton
                label={t('登录', 'Sign in')}
                tone="primary"
                type="submit"
                icon={<ArrowRight size={16} />}
                busy={busy}
                disabled={!token.trim()}
                width="100%"
                size="lg"
              />
              <p className="wb-hint">
                {t(
                  '令牌仅用于本次登录，不保存在浏览器存储中。',
                  'The token is used for sign-in only, never saved in browser storage.',
                )}
              </p>
            </form>
          )}
          <div className="wb-auth-sso">
            <ShieldCheck size={17} />
            <span>{t('企业单点登录', 'Enterprise SSO')}</span>
            <AppBadge>{t('未配置', 'Not configured')}</AppBadge>
          </div>
        </AppCard>
      </main>
      <footer className="wb-auth-footer">
        <span>mybot</span>
        <span>{t('单用户工作空间', 'Single-user workspace')}</span>
      </footer>
    </div>
  )
}
