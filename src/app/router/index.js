import { Router } from "express";
import { OtpRouter } from "../modules/otp/otp.route.js";
import { AuthRouter } from "../modules/auth/auth.route.js";

export const router = Router();
const moduleRoutes = [
  {
    path: "/otp",
    route: OtpRouter,
  },

  {
    path: "/auth",
    route: AuthRouter,
  },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});
