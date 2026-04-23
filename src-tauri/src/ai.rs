use tauri::{AppHandle, command, Emitter};
use async_openai::{
    types::{CreateChatCompletionRequestArgs, ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestUserMessageArgs},
    Client, config::OpenAIConfig,
};
use futures_util::StreamExt;
use crate::config::read_secrets;

#[command]
pub async fn ai_summarize(app: AppHandle, text: String, api_key: Option<String>) -> Result<(), String> {
    log::info!("Starting ai_summarize...");
    let secrets = read_secrets();
    // fallback to provided api_key if secret is missing
    let fallback_key = api_key.unwrap_or_default();
    let final_api_key = secrets.get("apiKey").and_then(|v| v.as_str()).unwrap_or(&fallback_key).to_string();
    let base_url = secrets.get("baseURL").and_then(|v| v.as_str()).unwrap_or("https://api.openai.com/v1").to_string();
    let model = secrets.get("chatModel").and_then(|v| v.as_str()).unwrap_or("gpt-3.5-turbo").to_string();

    let mut config = OpenAIConfig::new().with_api_key(final_api_key);
    if !base_url.is_empty() {
        config = config.with_api_base(base_url);
    }
    let client = Client::with_config(config);
    
    let request = CreateChatCompletionRequestArgs::default()
        .model(model)
        .messages([
            ChatCompletionRequestSystemMessageArgs::default()
                .content("你是一个专业的编辑和知识库助手。请完成以下任务：\n1. 为这篇笔记提取简明扼要的摘要和关键点。\n2. 对原文进行重构：修复拼写错误、改善语言清晰度、优化段落排版（保持 Markdown 格式）。\n\n请严格以下面的结构返回最终内容，不要添加任何多余的寒暄，并且必须使用 Markdown 引用语法（在摘要每行前加 `> `）来呈现摘要部分：\n\n> [在此输出摘要和要点，每行都必须以 `> ` 开头]\n\n[在此输出经过重构、排版和修复后的原文正文，正文部分不需要加引用符号]")
                .build()
                .unwrap()
                .into(),
            ChatCompletionRequestUserMessageArgs::default()
                .content(text)
                .build()
                .unwrap()
                .into(),
        ])
        .stream(true)
        .build()
        .map_err(|e| {
            log::error!("Failed to build AI request: {}", e);
            e.to_string()
        })?;

    let mut stream = client.chat().create_stream(request).await.map_err(|e| {
        log::error!("Failed to create AI stream: {}", e);
        e.to_string()
    })?;

    while let Some(result) = stream.next().await {
        match result {
            Ok(response) => {
                if let Some(choice) = response.choices.first() {
                    if let Some(ref content) = choice.delta.content {
                        let _ = app.emit("ai-chunk", content.clone());
                    }
                }
            }
            Err(err) => {
                log::error!("AI stream error: {}", err);
                let _ = app.emit("ai-error", err.to_string());
                break;
            }
        }
    }

    log::info!("Finished ai_summarize.");
    let _ = app.emit("ai-done", ());
    Ok(())
}

#[command]
pub async fn ai_completion(app: AppHandle, prompt: String, api_key: Option<String>) -> Result<(), String> {
    log::info!("Starting ai_completion...");
    let secrets = read_secrets();
    // fallback to provided api_key if secret is missing
    let fallback_key = api_key.unwrap_or_default();
    let final_api_key = secrets.get("apiKey").and_then(|v| v.as_str()).unwrap_or(&fallback_key).to_string();
    let base_url = secrets.get("baseURL").and_then(|v| v.as_str()).unwrap_or("https://api.openai.com/v1").to_string();
    let model = secrets.get("chatModel").and_then(|v| v.as_str()).unwrap_or("gpt-3.5-turbo").to_string();

    let mut config = OpenAIConfig::new().with_api_key(final_api_key);
    if !base_url.is_empty() {
        config = config.with_api_base(base_url);
    }
    let client = Client::with_config(config);
    
    let request = CreateChatCompletionRequestArgs::default()
        .model(model)
        .messages([
            ChatCompletionRequestSystemMessageArgs::default()
                .content("You are an AI writing assistant. Continue or modify the text as requested by the user.")
                .build()
                .unwrap()
                .into(),
            ChatCompletionRequestUserMessageArgs::default()
                .content(prompt)
                .build()
                .unwrap()
                .into(),
        ])
        .stream(true)
        .build()
        .map_err(|e| {
            log::error!("Failed to build AI request: {}", e);
            e.to_string()
        })?;

    let mut stream = client.chat().create_stream(request).await.map_err(|e| {
        log::error!("Failed to create AI stream: {}", e);
        e.to_string()
    })?;

    while let Some(result) = stream.next().await {
        match result {
            Ok(response) => {
                if let Some(choice) = response.choices.first() {
                    if let Some(ref content) = choice.delta.content {
                        let _ = app.emit("ai-chunk", content.clone());
                    }
                }
            }
            Err(err) => {
                log::error!("AI stream error: {}", err);
                let _ = app.emit("ai-error", err.to_string());
                break;
            }
        }
    }

    log::info!("Finished ai_completion.");
    let _ = app.emit("ai-done", ());
    Ok(())
}
