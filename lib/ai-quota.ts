import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const DAILY_AI_LIMIT = 20;

export async function consumeAiQuota(userId: string): Promise<boolean> {
  const windowStart = new Date();
  windowStart.setUTCHours(0, 0, 0, 0);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const usage = await transaction.aiUsage.findUnique({
          where: { userId_windowStart: { userId, windowStart } },
        });
        if (usage && usage.count >= DAILY_AI_LIMIT) return false;

        if (usage) {
          await transaction.aiUsage.update({
            where: { id: usage.id },
            data: { count: { increment: 1 } },
          });
        } else {
          await transaction.aiUsage.create({ data: { userId, windowStart, count: 1 } });
        }
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") continue;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }

  return false;
}