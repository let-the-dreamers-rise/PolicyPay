import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { config } from "./config";

let memoryServer: MongoMemoryServer | null = null;

export async function connectDB(): Promise<void> {
  const mongoUri = config.USE_IN_MEMORY_MONGO
    ? await getInMemoryMongoUri()
    : config.MONGODB_URI;

  await mongoose.connect(mongoUri);
  console.log(
    config.USE_IN_MEMORY_MONGO
      ? `Connected to in-memory MongoDB at ${mongoUri}`
      : "Connected to MongoDB",
  );
}

async function getInMemoryMongoUri(): Promise<string> {
  if (!memoryServer) {
    memoryServer = await MongoMemoryServer.create({
      instance: {
        dbName: "policypay",
      },
    });
  }

  return memoryServer.getUri();
}
