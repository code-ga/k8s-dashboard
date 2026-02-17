export const FRONTEND_URLs = [
	...(process.env.FRONTEND_URL?.split(",") || []),
	"http://localhost:3000",
];
