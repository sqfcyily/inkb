use tauri::{AppHandle, command, Emitter};
use async_openai::{
    types::{CreateChatCompletionRequestArgs, ChatCompletionRequestSystemMessageArgs, ChatCompletionRequestUserMessageArgs},
    Client, config::OpenAIConfig,
};
use futures_util::StreamExt;

#[command]
pub async fn ai_summarize(app: AppHandle, text: String, api_key: String) -> Result<(), String> {
    let config = OpenAIConfig::new().with_api_key(api_key);
    let client = Client::with_config(config);
    
    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-3.5-turbo")
        .messages([
            ChatCompletionRequestSystemMessageArgs::default()
                .content("You are a helpful assistant. Summarize the following text concisely.")
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
        .map_err(|e| e.to_string())?;

    let mut stream = client.chat().create_stream(request).await.map_err(|e| e.to_string())?;

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
                let _ = app.emit("ai-error", err.to_string());
                break;
            }
        }
    }

    let _ = app.emit("ai-done", ());
    Ok(())
}

#[command]
pub async fn ai_completion(app: AppHandle, prompt: String, api_key: String) -> Result<(), String> {
    let config = OpenAIConfig::new().with_api_key(api_key);
    let client = Client::with_config(config);
    
    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-3.5-turbo")
        .messages([
            ChatCompletionRequestSystemMessageArgs::default()
                .content("You are a helpful assistant. Continue the text.")
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
        .map_err(|e| e.to_string())?;

    let mut stream = client.chat().create_stream(request).await.map_err(|e| e.to_string())?;

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
                let _ = app.emit("ai-error", err.to_string());
                break;
            }
        }
    }

    let _ = app.emit("ai-done", ());
    Ok(())
}
