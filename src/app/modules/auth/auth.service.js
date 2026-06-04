import { StatusCodes } from "http-status-codes";
import bcrypt from "bcrypt";
import DevBuildError from "../../lib/DevBuildError.js";
import { createUserTokens } from "../../utils/userTokenGenerator.js";
import { OtpService } from "../otp/otp.service.js";
import { redisClient } from "../../config/redis.config.js";
import jwt from "jsonwebtoken";

const RESET_TOKEN_KEY_PREFIX = "reset-token";
const RESET_TOKEN_EXPIRATION = 10 * 60; // 10 minutes

const signup = async (prisma, payload) => {
  const { first_name, last_name, email, password, business_name } = payload;

  const existingUser = await prisma.users.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new DevBuildError(
      "User already exists with this email",
      StatusCodes.CONFLICT,
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.users.create({
      data: {
        first_name,
        last_name,
        email,
        password: hashedPassword,
        role: "RESTAURANT_OWNER",
        status: "active",
        is_verified: false,
      },
    });

    const restaurant = await tx.restaurants.create({
      data: {
        name: business_name,
        owner_id: user.id,
        status: "active",
      },
    });

    return { user, restaurant };
  });

  return result;
};

const login = async (prisma, payload) => {
  const { email, password } = payload;

  const user = await prisma.users.findUnique({
    where: { email },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  if (user.role === "RESTAURANT_OWNER" && !user.is_verified) {
    throw new DevBuildError(
      "Please verify your account first",
      StatusCodes.FORBIDDEN,
    );
  }

  if (user.status !== "active") {
    throw new DevBuildError(
      "Your account is not active",
      StatusCodes.FORBIDDEN,
    );
  }

  const isPasswordMatch = await bcrypt.compare(password, user.password);

  if (!isPasswordMatch) {
    throw new DevBuildError("Incorrect password", StatusCodes.UNAUTHORIZED);
  }

  const tokens = createUserTokens(user);

  return {
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      avatar: user.avatar,
    },
    ...tokens,
  };
};

const refreshAccessToken = async (prisma, token) => {
  if (!token) {
    throw new DevBuildError(
      "No refresh token provided. Please login again.",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const { envVars } = await import("../../config/env.js");
  const jwtLib = await import("jsonwebtoken");

  let decoded;
  try {
    decoded = jwtLib.default.verify(token, envVars.JWT_REFRESH_TOKEN);
  } catch {
    throw new DevBuildError(
      "Refresh token is invalid or expired. Please login again.",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const user = await prisma.users.findUnique({
    where: { id: decoded.id },
    select: {
      id: true,
      email: true,
      role: true,
      is_verified: true,
      status: true,
    },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  if (user.status !== "active") {
    throw new DevBuildError(
      "Your account is not active",
      StatusCodes.FORBIDDEN,
    );
  }

  // Generate a fresh access token
  const accessToken = jwtLib.default.sign(
    { id: user.id, email: user.email, role: user.role },
    envVars.JWT_SECRET_TOKEN,
    { expiresIn: envVars.JWT_EXPIRES_IN },
  );

  return { accessToken };
};

const sendForgotPasswordOtp = async (prisma, email) => {
  const user = await prisma.users.findUnique({
    where: { email },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  await OtpService.sendForgotPasswordOtp(prisma, email);
};

const verifyForgotPasswordOtp = async (prisma, email, otp) => {
  const resetToken = await OtpService.verifyForgotPasswordOtp(
    prisma,
    email,
    otp,
  );

  // Decode token to get user id for Redis key
  const decoded = jwt.decode(resetToken);

  const resetRedisKey = `${RESET_TOKEN_KEY_PREFIX}:${decoded.id}`;
  await redisClient.set(resetRedisKey, resetToken, {
    EX: RESET_TOKEN_EXPIRATION,
  });

  return resetToken;
};

const resetPassword = async (prisma, userId, resetToken, newPassword) => {
  // Check Redis — token must still exist (not used, not expired)
  const resetRedisKey = `${RESET_TOKEN_KEY_PREFIX}:${userId}`;
  const storedToken = await redisClient.get(resetRedisKey);

  if (!storedToken) {
    throw new DevBuildError(
      "Reset token has already been used or has expired",
      StatusCodes.UNAUTHORIZED,
    );
  }

  if (storedToken !== resetToken) {
    throw new DevBuildError("Invalid reset token", StatusCodes.UNAUTHORIZED);
  }

  const user = await prisma.users.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.users.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  // Invalidate token immediately (one-time use)
  await redisClient.del(resetRedisKey);
};

const changePassword = async (prisma, userId, currentPassword, newPassword) => {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: { id: true, role: true, password: true },
  });

  if (!user) {
    throw new DevBuildError("User does not exist", StatusCodes.NOT_FOUND);
  }

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new DevBuildError(
      "Current password is incorrect",
      StatusCodes.UNAUTHORIZED,
    );
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.users.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });
};

export const AuthService = {
  signup,
  login,
  refreshAccessToken,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  changePassword,
};
