// GERADO por scripts/build-d1-schema.mjs a partir de d1/schema.src.sql — não editar à mão.

export type TableMeta = {
  columns: readonly string[];
  bool: readonly string[];
  json: readonly string[];
  ts: readonly string[];
  pk: readonly string[];
};

export const SCHEMA: Record<string, TableMeta> = {
  "areas": {
    "columns": [
      "id",
      "nome",
      "revenue_goal",
      "public_token",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "branding": {
    "columns": [
      "id",
      "product_name",
      "logo_light_url",
      "logo_dark_url",
      "favicon_url",
      "primary_color_override",
      "updated_at"
    ],
    "bool": [
      "id"
    ],
    "json": [],
    "ts": [
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "settings": {
    "columns": [
      "area_id",
      "currency",
      "tax_rate",
      "revenue_goal",
      "allowed_origins",
      "gateway_fee_pct",
      "gateway_fee_fixed",
      "break_even_value",
      "updated_at"
    ],
    "bool": [],
    "json": [
      "allowed_origins"
    ],
    "ts": [
      "updated_at"
    ],
    "pk": [
      "area_id"
    ]
  },
  "meta_ad_accounts": {
    "columns": [
      "id",
      "area_id",
      "label",
      "ad_account_id",
      "ads_token",
      "currency",
      "last_known_status",
      "alerts_muted",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "alerts_muted"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "visitors": {
    "columns": [
      "id",
      "area_id",
      "user_id",
      "email",
      "telefone",
      "nome",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "referrer",
      "ip",
      "user_agent",
      "geo_country",
      "geo_region",
      "geo_city",
      "created_at",
      "updated_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "events_log": {
    "columns": [
      "id",
      "area_id",
      "user_id",
      "event_name",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ip",
      "geo_country",
      "geo_region",
      "geo_city",
      "page_url",
      "fbp",
      "fbc",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "purchases": {
    "columns": [
      "id",
      "area_id",
      "transaction_id",
      "user_id",
      "email",
      "telefone",
      "produto",
      "valor",
      "moeda",
      "status",
      "plataforma",
      "payment_method",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ad_id",
      "geo_country",
      "geo_region",
      "geo_city",
      "match",
      "raw_webhook",
      "created_at",
      "updated_at"
    ],
    "bool": [],
    "json": [
      "raw_webhook"
    ],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "automation_rules": {
    "columns": [
      "id",
      "area_id",
      "nome",
      "nivel",
      "metric",
      "operator",
      "value",
      "period",
      "action",
      "ativa",
      "last_run",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "ativa"
    ],
    "json": [],
    "ts": [
      "last_run",
      "created_at",
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "rule_executions": {
    "columns": [
      "id",
      "area_id",
      "rule_id",
      "ran_at",
      "matched",
      "action_taken",
      "target_level",
      "target_id",
      "details"
    ],
    "bool": [
      "matched"
    ],
    "json": [
      "details"
    ],
    "ts": [
      "ran_at"
    ],
    "pk": [
      "id"
    ]
  },
  "audit_log": {
    "columns": [
      "id",
      "area_id",
      "actor_email",
      "action",
      "target_type",
      "target_id",
      "details",
      "created_at"
    ],
    "bool": [],
    "json": [
      "details"
    ],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "rate_limit_counters": {
    "columns": [
      "bucket_key",
      "window_start",
      "count"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "window_start"
    ],
    "pk": [
      "bucket_key",
      "window_start"
    ]
  },
  "checkout_integrations": {
    "columns": [
      "area_id",
      "plataforma",
      "secret",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id",
      "plataforma"
    ]
  },
  "product_tiers": {
    "columns": [
      "area_id",
      "produto",
      "tier",
      "created_at",
      "updated_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id",
      "produto"
    ]
  },
  "vturb_integrations": {
    "columns": [
      "area_id",
      "api_key",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id"
    ]
  },
  "vturb_players": {
    "columns": [
      "id",
      "area_id",
      "player_id",
      "label",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "google_sheets_integrations": {
    "columns": [
      "area_id",
      "spreadsheet_id",
      "service_account_json",
      "template_tab_name",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id"
    ]
  },
  "creative_reports": {
    "columns": [
      "id",
      "area_id",
      "week_start",
      "week_end",
      "account_id",
      "account_label",
      "ad_id",
      "ad_name",
      "campaign_id",
      "campaign_name",
      "status",
      "spend",
      "impressions",
      "clicks",
      "page_views",
      "initiate_checkout",
      "meta_purchases",
      "meta_revenue",
      "vturb_player_id",
      "hook_rate",
      "play_rate",
      "plays",
      "pitch_retention",
      "cta_clicks",
      "sales_vd",
      "revenue_vd",
      "sales_upsell",
      "revenue_upsell",
      "sales_downsell",
      "revenue_downsell",
      "sales_total",
      "revenue_total",
      "roas",
      "cac",
      "net_margin",
      "delta_meta_vs_own",
      "spend_usd",
      "vturb_views",
      "vturb_unique_views",
      "vturb_conversions",
      "vturb_revenue",
      "retention_25",
      "retention_50",
      "retention_75",
      "avg_watch_seconds",
      "refund_value",
      "chargeback_value",
      "canceled_count",
      "unique_buyers",
      "cpa",
      "net_revenue",
      "profit_margin_pct",
      "rpv",
      "arpu",
      "conversion_rate",
      "pv_ic_rate",
      "checkout_rate",
      "ticket_medio",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "weekly_report_runs": {
    "columns": [
      "id",
      "area_id",
      "week_start",
      "week_end",
      "sheet_tab_name",
      "status",
      "error",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "daily_campaign_sheets": {
    "columns": [
      "area_id",
      "spreadsheet_id",
      "service_account_json",
      "template_tab_name",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id"
    ]
  },
  "daily_campaign_checkpoints": {
    "columns": [
      "id",
      "area_id",
      "day",
      "campaign_id",
      "campaign_name",
      "horario",
      "sheet_tab_name",
      "spend",
      "revenue",
      "impressions",
      "clicks",
      "page_views",
      "initiate_checkout",
      "sales",
      "status",
      "error",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "ga4_integrations": {
    "columns": [
      "area_id",
      "property_id",
      "service_account_json",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id"
    ]
  },
  "ga4_landing_pages": {
    "columns": [
      "id",
      "area_id",
      "day",
      "landing_page",
      "sessions",
      "active_users",
      "new_users",
      "avg_engagement_seconds",
      "key_events",
      "total_revenue",
      "key_event_rate",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "ga4_session_sources": {
    "columns": [
      "id",
      "area_id",
      "day",
      "source",
      "active_users",
      "sessions",
      "engaged_sessions",
      "avg_engagement_seconds",
      "engaged_sessions_per_user",
      "events_per_session",
      "engagement_rate",
      "key_events",
      "event_count",
      "total_revenue",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "ga4_source_mediums": {
    "columns": [
      "id",
      "area_id",
      "day",
      "source_medium",
      "sessions",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "whatsapp_integrations": {
    "columns": [
      "area_id",
      "base_url",
      "instance",
      "api_key",
      "target_number",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id"
    ]
  },
  "alert_state": {
    "columns": [
      "area_id",
      "alert_type",
      "last_alerted_at",
      "last_state",
      "updated_at"
    ],
    "bool": [],
    "json": [
      "last_state"
    ],
    "ts": [
      "last_alerted_at",
      "updated_at"
    ],
    "pk": [
      "area_id",
      "alert_type"
    ]
  },
  "support_ai_sessions": {
    "columns": [
      "id",
      "area_id",
      "chat_id",
      "contact_phone",
      "mode",
      "escalation_reason",
      "last_customer_message_at",
      "created_at",
      "updated_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "last_customer_message_at",
      "created_at",
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "meta_wa_integrations": {
    "columns": [
      "area_id",
      "access_token",
      "waba_id",
      "phone_number_id",
      "display_phone",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id"
    ]
  },
  "wa_dispatch_rules": {
    "columns": [
      "id",
      "area_id",
      "trigger",
      "template_name",
      "template_language",
      "body_params",
      "delay_minutes",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [
      "body_params"
    ],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "api_campaigns": {
    "columns": [
      "id",
      "area_id",
      "label",
      "template_name",
      "template_language",
      "total",
      "scheduled_at",
      "finished_at",
      "canceled_at",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "scheduled_at",
      "finished_at",
      "canceled_at",
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "wa_dispatch_log": {
    "columns": [
      "id",
      "area_id",
      "rule_id",
      "campaign_id",
      "trigger",
      "campaign_label",
      "source_ref",
      "telefone",
      "template_name",
      "template_language",
      "params",
      "status",
      "error",
      "wamid",
      "scheduled_at",
      "sent_at",
      "claimed_at",
      "created_at"
    ],
    "bool": [],
    "json": [
      "params"
    ],
    "ts": [
      "scheduled_at",
      "sent_at",
      "claimed_at",
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "wa_optouts": {
    "columns": [
      "area_id",
      "telefone",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at"
    ],
    "pk": [
      "area_id",
      "telefone"
    ]
  },
  "email_rules": {
    "columns": [
      "id",
      "area_id",
      "trigger",
      "subject",
      "body",
      "button_label",
      "button_url",
      "from_name",
      "reply_to",
      "delay_minutes",
      "enabled",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "enabled"
    ],
    "json": [],
    "ts": [
      "created_at",
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "email_log": {
    "columns": [
      "id",
      "area_id",
      "rule_id",
      "trigger",
      "source_ref",
      "email",
      "context",
      "subject",
      "status",
      "error",
      "provider_id",
      "scheduled_at",
      "sent_at",
      "claimed_at",
      "created_at"
    ],
    "bool": [],
    "json": [
      "context"
    ],
    "ts": [
      "scheduled_at",
      "sent_at",
      "claimed_at",
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "api_credentials": {
    "columns": [
      "area_id",
      "api_key",
      "secret_hash",
      "webhook_url",
      "webhook_secret",
      "webhook_events",
      "webhook_enabled",
      "webhook_failures",
      "last_used_at",
      "created_at",
      "updated_at"
    ],
    "bool": [
      "webhook_enabled"
    ],
    "json": [
      "webhook_events"
    ],
    "ts": [
      "last_used_at",
      "created_at",
      "updated_at"
    ],
    "pk": [
      "area_id"
    ]
  },
  "api_webhook_deliveries": {
    "columns": [
      "id",
      "area_id",
      "event",
      "payload",
      "status",
      "attempts",
      "next_attempt_at",
      "last_status",
      "last_error",
      "delivered_at",
      "created_at"
    ],
    "bool": [],
    "json": [
      "payload"
    ],
    "ts": [
      "next_attempt_at",
      "delivered_at",
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "auth_users": {
    "columns": [
      "id",
      "email",
      "password_hash",
      "user_metadata",
      "email_confirmed_at",
      "last_sign_in_at",
      "created_at",
      "updated_at"
    ],
    "bool": [],
    "json": [
      "user_metadata"
    ],
    "ts": [
      "email_confirmed_at",
      "last_sign_in_at",
      "created_at",
      "updated_at"
    ],
    "pk": [
      "id"
    ]
  },
  "auth_sessions": {
    "columns": [
      "id",
      "user_id",
      "kind",
      "expires_at",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "expires_at",
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "auth_tokens": {
    "columns": [
      "id",
      "user_id",
      "kind",
      "expires_at",
      "used_at",
      "created_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "expires_at",
      "used_at",
      "created_at"
    ],
    "pk": [
      "id"
    ]
  },
  "push_subscriptions": {
    "columns": [
      "id",
      "user_id",
      "endpoint",
      "p256dh",
      "auth",
      "user_agent",
      "created_at",
      "last_success_at"
    ],
    "bool": [],
    "json": [],
    "ts": [
      "created_at",
      "last_success_at"
    ],
    "pk": [
      "id"
    ]
  }
};
