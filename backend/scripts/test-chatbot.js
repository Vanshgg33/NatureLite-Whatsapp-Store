import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { AdminChatbotService } from '../src/modules/admin-chatbot/admin-chatbot.service';

async function run() {
  console.log("Bootstrapping NestJS application...");
  const app = await NestFactory.createApplicationContext(AppModule);
  console.log("NestJS booted successfully!");

  const chatbotService = app.get(AdminChatbotService);

  const query = "now tell me top selling product";
  console.log(`\nExecuting chatbot query: "${query}"`);

  try {
    const result = await chatbotService.chat(query);
    console.log("\n================ CHATBOT REPLY ===================");
    console.log(result.reply);
    console.log("==================================================");
  } catch (err) {
    console.error("Error executing chatbot service:", err);
  } finally {
    await app.close();
  }
}

run();
