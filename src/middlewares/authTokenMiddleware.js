export default function authTokenMiddleware(req, res, next){
    const authHeader = req.headers['authorization']
    
    const authToken = process.env.AUTH_TOKEN 

    if (!authHeader) return res.status(401).send("Unauthorized")

    if (authHeader != authToken) return res.status(401).send("invalid token")
    
    next()

}