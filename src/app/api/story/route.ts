import { randomStory } from '@/app/helper/actions';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        const story = await randomStory()
        return Response.json(story)
    } catch (error: any) {
        return NextResponse.json(null, { status: 400, statusText: error.message })
    }
}
