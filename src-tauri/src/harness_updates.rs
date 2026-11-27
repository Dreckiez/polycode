use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::Value;

const REGISTRY_URL: &str = "https://registry.npmjs.org";
// The same platform manifests Google uses in its Windows CLI installer.
const ANTIGRAVITY_MANIFESTS_URL: &str =
    "https://antigravity-cli-auto-updater-974169037036.us-central1.run.app/manifests";
const USER_AGENT: &str = "PolyCode";
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

fn release_url(provider: &str, os: &str, arch: &str) -> Option<String> {
    let package = match provider {
        "antigravity" => {
            let platform = match (os, arch) {
                ("windows", "x86_64") => "windows_amd64",
                ("windows", "aarch64") => "windows_arm64",
                _ => return None,
            };
            return Some(format!("{ANTIGRAVITY_MANIFESTS_URL}/{platform}.json"));
        }
        "claude" => "@anthropic-ai/claude-code",
        "codex" => "@openai/codex",
        "opencode" => "opencode-ai",
        "pi" => "@earendil-works/pi-coding-agent",
        _ => return None,
    };
    Some(format!("{REGISTRY_URL}/{package}/latest"))
}

static LAUNCH_CHECK_CLAIMED: AtomicBool = AtomicBool::new(false);

/// True for the first caller per app process, so a window opened later in the
/// same run does not repeat the launch check.
#[tauri::command]
pub fn harness_update_check_claim() -> bool {
    !LAUNCH_CHECK_CLAIMED.swap(true, Ordering::SeqCst)
}

#[tauri::command]
pub async fn harness_latest_version(provider: String) -> Result<String, String> {
    let url = release_url(&provider, std::env::consts::OS, std::env::consts::ARCH)
        .ok_or_else(|| format!("No update feed for harness: {provider}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new().timeout(HTTP_TIMEOUT).build();
        let text = agent
            .get(&url)
            .set("User-Agent", USER_AGENT)
            .set("Accept", "application/json")
            .call()
            .map_err(|error| format!("Version feed request failed: {error}"))?
            .into_string()
            .map_err(|error| format!("Version feed response unreadable: {error}"))?;
        let body: Value = serde_json::from_str(&text)
            .map_err(|error| format!("Version feed returned invalid JSON: {error}"))?;
        latest_version(&body).ok_or_else(|| "Version feed returned no version".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

fn latest_version(body: &Value) -> Option<String> {
    let version = body.get("version")?.as_str()?.trim();
    (!version.is_empty()).then(|| version.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_only_harnesses_with_known_feeds() {
        assert_eq!(
            release_url("claude", "windows", "x86_64").as_deref(),
            Some("https://registry.npmjs.org/@anthropic-ai/claude-code/latest")
        );
        assert_eq!(
            release_url("pi", "windows", "aarch64").as_deref(),
            Some("https://registry.npmjs.org/@earendil-works/pi-coding-agent/latest")
        );
        assert_eq!(release_url("cursor", "windows", "x86_64"), None);
        assert_eq!(release_url("../../evil", "windows", "x86_64"), None);
    }

    #[test]
    fn selects_antigravity_manifest_for_windows_architecture() {
        assert_eq!(
            release_url("antigravity", "windows", "x86_64"),
            Some(format!("{ANTIGRAVITY_MANIFESTS_URL}/windows_amd64.json"))
        );
        assert_eq!(
            release_url("antigravity", "windows", "aarch64"),
            Some(format!("{ANTIGRAVITY_MANIFESTS_URL}/windows_arm64.json"))
        );
        assert_eq!(release_url("antigravity", "linux", "x86_64"), None);
    }

    #[test]
    fn reads_version_from_registry_payload() {
        assert_eq!(
            latest_version(&json!({ "name": "opencode-ai", "version": "1.18.33" })),
            Some("1.18.33".to_string())
        );
        assert_eq!(latest_version(&json!({ "version": " " })), None);
        assert_eq!(latest_version(&json!({})), None);
    }
}
