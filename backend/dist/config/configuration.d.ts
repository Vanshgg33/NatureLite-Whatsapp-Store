export interface AppConfig {
    nodeEnv: string;
    port: number;
    apiPrefix: string;
}
export interface DatabaseConfig {
    uri: string;
}
export interface RedisConfig {
    host: string;
    port: number;
    password: string;
}
export interface JwtConfig {
    secret: string;
    expiresIn: string;
}
export interface WhatsAppConfig {
    apiUrl: string;
    phoneNumberId: string;
    businessAccountId: string;
    accessToken: string;
    webhookVerifyToken: string;
    appSecret: string;
}
export interface CloudinaryConfig {
    cloudName: string;
    apiKey: string;
    apiSecret: string;
}
export interface ShiprocketConfig {
    email: string;
    password: string;
    apiUrl: string;
}
export interface ThrottleConfig {
    ttl: number;
    limit: number;
}
export interface Configuration {
    app: AppConfig;
    database: DatabaseConfig;
    redis: RedisConfig;
    jwt: JwtConfig;
    whatsapp: WhatsAppConfig;
    cloudinary: CloudinaryConfig;
    shiprocket: ShiprocketConfig;
    throttle: ThrottleConfig;
    frontendUrl: string;
}
declare const _default: () => Configuration;
export default _default;
