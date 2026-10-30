import app from '../index'

const handleRequest = async (request: Request): Promise<Response> => app.fetch(request)

export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const DELETE = handleRequest
export const PATCH = handleRequest
export const OPTIONS = handleRequest