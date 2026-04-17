# Frontend components (summary)

Components live under [`frontend/src/components/`](../../../frontend/src/components/). Below: role of each area; open source file for props and implementation.

## Charts and trading visuals
| Component | Purpose |
|-----------|---------|
| [`Chart.tsx`](../../../frontend/src/components/Chart.tsx) | Base price chart wrapper |
| [`CisdChart.tsx`](../../../frontend/src/components/CisdChart.tsx) | CISD-specific chart + overlays |
| [`InteractiveLiveChart.tsx`](../../../frontend/src/components/InteractiveLiveChart.tsx) | Live candle stream + interactions |
| [`InteractiveLiveChartGate.tsx`](../../../frontend/src/components/InteractiveLiveChartGate.tsx) | Tier/auth gate before heavy chart |
| [`MiniChart.tsx`](../../../frontend/src/components/MiniChart.tsx) / [`StaticMiniChart.tsx`](../../../frontend/src/components/StaticMiniChart.tsx) | Compact sparklines |
| [`TradingViewWidget.tsx`](../../../frontend/src/components/TradingViewWidget.tsx) | Embedded TradingView |

## Layout and chrome
| Component | Purpose |
|-----------|---------|
| [`MainLayout.tsx`](../../../frontend/src/components/MainLayout.tsx) | App shell |
| [`Header.tsx`](../../../frontend/src/components/Header.tsx), [`Sidebar.tsx`](../../../frontend/src/components/Sidebar.tsx) | Desktop nav |
| [`MobileMenu.tsx`](../../../frontend/src/components/MobileMenu.tsx), [`layout/MobileHeader.tsx`](../../../frontend/src/components/layout/MobileHeader.tsx), [`layout/MobileBottomNav.tsx`](../../../frontend/src/components/layout/MobileBottomNav.tsx) | Mobile UX |
| [`ThemeToggle.tsx`](../../../frontend/src/components/ThemeToggle.tsx) | Dark/light switch |

## Payments and monetization
| Component | Purpose |
|-----------|---------|
| [`PaymentWidget.tsx`](../../../frontend/src/components/PaymentWidget.tsx) | Crypto payment UI |
| [`ProOverlay.tsx`](../../../frontend/src/components/ProOverlay.tsx), [`shared/ProOverlay.tsx`](../../../frontend/src/components/shared/ProOverlay.tsx) | Locked-feature overlays |
| [`ReferralSection.tsx`](../../../frontend/src/components/ReferralSection.tsx) | Referral CTA |

## Shared UX
| Component | Purpose |
|-----------|---------|
| [`shared/FloatingChart.tsx`](../../../frontend/src/components/shared/FloatingChart.tsx), [`FloatingChartManager.tsx`](../../../frontend/src/components/shared/FloatingChartManager.tsx) | Detachable charts |
| [`shared/GlobalToastManager.tsx`](../../../frontend/src/components/shared/GlobalToastManager.tsx), [`GlobalNotificationPoller.tsx`](../../../frontend/src/components/shared/GlobalNotificationPoller.tsx) | Toasts / polling |
| [`shared/NotificationBell.tsx`](../../../frontend/src/components/shared/NotificationBell.tsx) | Notification center |
| [`shared/CommandPalette.tsx`](../../../frontend/src/components/shared/CommandPalette.tsx) | Command palette |
| [`shared/FilterMenu.tsx`](../../../frontend/src/components/shared/FilterMenu.tsx), [`PatternFilter.tsx`](../../../frontend/src/components/shared/PatternFilter.tsx), [`VolumeFilter.tsx`](../../../frontend/src/components/shared/VolumeFilter.tsx) | List filters |
| [`shared/TrendIndicator.tsx`](../../../frontend/src/components/shared/TrendIndicator.tsx), [`SignalBadge.tsx`](../../../frontend/src/components/shared/SignalBadge.tsx), [`SignalStatusBadge.tsx`](../../../frontend/src/components/shared/SignalStatusBadge.tsx) | Signal row UI |
| [`shared/NeonLoader.tsx`](../../../frontend/src/components/shared/NeonLoader.tsx) | Loading spinner |
| [`shared/FavoriteStar.tsx`](../../../frontend/src/components/shared/FavoriteStar.tsx) | Watchlist toggle |
| [`shared/TimeDisplay.tsx`](../../../frontend/src/components/shared/TimeDisplay.tsx) | Timezone-aware time |
| [`shared/LaunchPromoBanner.tsx`](../../../frontend/src/components/shared/LaunchPromoBanner.tsx) | Promo banner |
| [`shared/StatusTabs.tsx`](../../../frontend/src/components/shared/StatusTabs.tsx) | Lifecycle tabs |

## Landing / marketing
[`landing/`](../../../frontend/src/components/landing/) — `Hero`, `Features`, `Pricing`, `Navbar`, `Footer`, `Stats`, `Strategies`, `HowItWorks`.

## Animations
[`animations/`](../../../frontend/src/components/animations/) — `AnimatedPage`, `AnimatedCard`, `AnimatedList`, `AnimatedNumber`.

## Settings
[`settings/TelegramAlertsConfig.tsx`](../../../frontend/src/components/settings/TelegramAlertsConfig.tsx), [`settings/TimezoneSelector.tsx`](../../../frontend/src/components/settings/TimezoneSelector.tsx).

## Subscriptions UI
[`subscriptions/`](../../../frontend/src/components/subscriptions/) — `SubscriptionCard`, `FeatureComparison`, `BackgroundEffects`, `SubscriptionBadge`.

## UI primitives
[`ui/Button.tsx`](../../../frontend/src/components/ui/Button.tsx), [`ui/Card.tsx`](../../../frontend/src/components/ui/Card.tsx) — design-system building blocks.

## Constants
[`constants/features.ts`](../../../frontend/src/constants/features.ts) — feature flags for marketing/compare tables.
