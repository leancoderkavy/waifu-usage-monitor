//! Optional local LLM voice. Talks to Ollama (native API, thinking off) or any
//! OpenAI-compatible server such as llama.cpp's `llama-server`.

use anyhow::{bail, Context, Result};
use serde_json::{json, Value};

use crate::providers::check;

/// Every number the model says must come from the facts it was given.
/// Small models like to invent percentages; a template line is safer than a wrong one.
fn numbers_grounded(reply: &str, facts: &str) -> bool {
    let nums = |s: &str| -> Vec<String> {
        s.split(|c: char| !(c.is_ascii_digit() || c == '.'))
            .map(|t| t.trim_matches('.'))
            .filter(|t| t.chars().any(|c| c.is_ascii_digit()))
            .map(String::from)
            .collect()
    };
    let known = nums(facts);
    nums(reply).iter().all(|n| known.contains(n))
}

/// True when an Ollama server at `url` has `model` pulled.
pub async fn available(url: &str, model: &str) -> bool {
    let base = url.trim_end_matches('/');
    let Ok(resp) = reqwest::Client::new()
        .get(format!("{base}/api/tags"))
        .timeout(std::time::Duration::from_secs(3))
        .send()
        .await
    else {
        return false;
    };
    let Ok(body) = resp.json::<Value>().await else { return false };
    body["models"]
        .as_array()
        .into_iter()
        .flatten()
        .any(|m| m["name"].as_str() == Some(model) || m["model"].as_str() == Some(model))
}

pub async fn line(url: &str, model: &str, system: &str, facts: &str) -> Result<String> {
    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(90))
        .build()?;
    let base = url.trim_end_matches('/');
    let messages = json!([
        { "role": "system", "content": system },
        { "role": "user", "content": facts },
    ]);

    let body: Value = if base.contains(":11434") {
        check(
            http.post(format!("{base}/api/chat"))
                .json(&json!({
                    "model": model,
                    "messages": messages,
                    "stream": false,
                    "think": false,
                    // Keep the model in memory between refreshes; loading it takes 20-45 s.
                    "keep_alive": "30m",
                    "options": { "temperature": 0.7, "top_p": 0.8, "top_k": 20, "num_predict": 90 }
                }))
                .send()
                .await
                .context("Ollama is not running")?,
        )
        .await?
    } else {
        check(
            http.post(format!("{base}/v1/chat/completions"))
                .json(&json!({
                    "model": model,
                    "messages": messages,
                    "temperature": 0.7,
                    "top_p": 0.8,
                    "max_tokens": 90,
                    "chat_template_kwargs": { "enable_thinking": false }
                }))
                .send()
                .await
                .context("local LLM server is not running")?,
        )
        .await?
    };

    let text = body["message"]["content"]
        .as_str()
        .or_else(|| body["choices"][0]["message"]["content"].as_str())
        .context("LLM returned no text")?;
    // Strip any reasoning block a model emits despite thinking being off.
    let text = match text.rfind("</think>") {
        Some(i) => &text[i + 8..],
        None => text,
    }
    .trim()
    .trim_matches('"')
    .to_string();

    if text.is_empty() {
        bail!("LLM returned an empty line");
    }
    if !numbers_grounded(&text, facts) {
        bail!("LLM made up a number: {text}");
    }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invented_numbers() {
        let facts = "- Claude Weekly at 28% remaining, restores in 4d 11h";
        assert!(numbers_grounded("Claude weekly reserve at 28%. Restores in 4d 11h.", facts));
        assert!(!numbers_grounded("Claude is at 35% remaining.", facts));
    }

    /// Needs Ollama with qwen3.5:4b. Run with `cargo test -- --ignored`.
    #[tokio::test]
    #[ignore]
    async fn ollama_speaks_in_character() {
        let system = "You are KOS-MOS, the combat android from Xenosaga, now monitoring AI usage limits for Operator.             Speak calmly and formally, like a precise android. Short sentences. Rare hints of warmth.             Reply with 1-2 sentences, under 40 words.             Copy account names, percentages and times exactly from the status list. Never invent, round or combine numbers.             No emoji, no stage directions, no quotes.             Example: \"Warning. Cursor Included usage is at 0% remaining. It restores in 19d 6h. I recommend switching accounts, Operator.\"";
        let facts = "Status, most urgent first:
            1. [CRITICAL] Claude Weekly · Fable at 0% remaining, restores in 4d 11h.
            2. [CRITICAL] Cursor Included usage at 0% remaining ($0.00 of $400.00), restores in 19d 6h.
            3. [OK] Claude Weekly (all models) at 28% remaining, restores in 4d 11h.
            4. [OK] ChatGPT / Codex Weekly window at 90% remaining, restores in 6d 19h.
            Report item 1, plus item 2 if it is also CRITICAL or LOW.";
        for _ in 0..5 {
            let t = std::time::Instant::now();
            match line("http://localhost:11434", "qwen3.5:4b", system, facts).await {
                Ok(l) => eprintln!("OK ({:.1}s): {l}", t.elapsed().as_secs_f32()),
                Err(e) => eprintln!("REJECTED ({:.1}s): {e:#}", t.elapsed().as_secs_f32()),
            }
        }
    }
}
