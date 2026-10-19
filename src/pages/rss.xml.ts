import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';
import { description, site, title } from '~shared';

export async function GET() {
  const articles = [
    ...(await getCollection('articles')).filter(post => !post.data.draft),
    ...(await getCollection('essays')).filter(post => !post.data.draft),
    ...(await getCollection('poems')).filter(post => !post.data.draft),
  ];

  return rss({
    title,
    description,
    site,
    items: articles.map((post) => {
      return {
        title: post.data.title,
        link: new URL(`/p/${post.id}`, site).toString(),
        description: post.data.description,
        categories: post.data.tags,
        content: post.rendered?.html,
        pubDate: post.data.date,
        author: 'Krish Gupta',
      };
    }),
  });
}
