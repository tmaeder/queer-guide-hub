-- Add sample blog articles
INSERT INTO public.content (
  title,
  slug,
  content_type,
  status,
  content,
  excerpt,
  featured_image,
  meta_description,
  published_at,
  created_at,
  updated_at
) VALUES
(
  'Welcome to Our Community Platform',
  'welcome-to-our-community-platform',
  'blog_post',
  'published',
  '# Welcome to Our Community Platform

We''re excited to launch this new community platform that brings together people from all walks of life. Whether you''re looking to discover local events, connect with like-minded individuals, or explore new venues in your area, we''ve got you covered.

## What You Can Do Here

- **Discover Events**: Find exciting events happening in your city
- **Connect with People**: Join groups and meet new friends
- **Explore Venues**: Discover amazing places to visit
- **Stay Updated**: Get the latest news and updates
- **Travel Smart**: Plan your trips with our travel tools

## Getting Started

Creating an account is quick and easy. Once you''re signed up, you can start exploring all the features our platform has to offer. Don''t forget to complete your profile to help others connect with you!

We''re constantly working to improve the platform and add new features based on your feedback. Welcome aboard!',
  'Discover our new community platform designed to connect people, share events, and explore amazing venues in your area.',
  'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=400&fit=crop',
  'Join our community platform to discover events, connect with people, and explore venues in your area.',
  now() - interval '2 days',
  now() - interval '2 days',
  now() - interval '2 days'
),
(
  'Top 10 Hidden Gems in Your City',
  'top-10-hidden-gems-in-your-city',
  'blog_post',
  'published',
  '# Top 10 Hidden Gems in Your City

Every city has its secrets - those special places that locals love but tourists rarely find. Today, we''re sharing some incredible hidden gems that you might not know about, right in your own backyard.

## 1. The Secret Garden Café

Tucked away behind a vintage bookstore, this charming café serves the best coffee in town along with homemade pastries. The garden seating area is perfect for a quiet afternoon.

## 2. Underground Art Gallery

This basement gallery showcases emerging local artists and hosts intimate live music sessions every Friday night. Entry is free, but donations are appreciated.

## 3. Rooftop Cinema

Every summer, this building transforms its rooftop into an outdoor cinema. Bring a blanket and enjoy classic movies under the stars.

## 4. The Midnight Food Truck

Operating from 10 PM to 3 AM, this food truck serves the most amazing late-night eats. Their signature dish is a fusion taco that''s become legendary among night owls.

## 5. Historic Walking Trail

This self-guided trail takes you through the oldest parts of the city, with QR codes at each stop providing fascinating historical context.

*And that''s just the beginning! Keep exploring to discover more amazing places in your area.*',
  'Discover amazing hidden gems and secret spots in your city that locals love but visitors rarely find.',
  'https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=800&h=400&fit=crop',
  'Explore hidden gems and secret spots in your city with our curated guide to local favorites.',
  now() - interval '1 day',
  now() - interval '1 day',
  now() - interval '1 day'
),
(
  'Building Stronger Communities: The Power of Local Events',
  'building-stronger-communities-power-of-local-events',
  'blog_post',
  'published',
  '# Building Stronger Communities: The Power of Local Events

In an increasingly digital world, the importance of face-to-face connections and local community engagement cannot be overstated. Local events serve as the heartbeat of vibrant communities, bringing people together and fostering relationships that extend far beyond a single gathering.

## Why Local Events Matter

Local events create opportunities for meaningful connections. They break down barriers between neighbors, introduce people with shared interests, and help build the social fabric that makes communities strong and resilient.

### Economic Impact

When people attend local events, they often shop at nearby businesses, eat at local restaurants, and discover new services. This creates a positive economic cycle that benefits everyone in the community.

### Cultural Exchange

Events provide a platform for sharing different cultures, traditions, and perspectives. Food festivals, art shows, and cultural celebrations help us learn from one another and appreciate our diversity.

## Tips for Organizing Successful Community Events

1. **Start Small**: Begin with manageable events and grow over time
2. **Partner with Local Businesses**: Collaboration amplifies impact
3. **Use Social Media Wisely**: Promote your event across multiple platforms
4. **Focus on Accessibility**: Ensure everyone can participate
5. **Gather Feedback**: Learn from each event to improve the next

## The Digital Connection

Platforms like ours help bridge the gap between digital discovery and real-world connections. By making it easier to find and promote local events, we''re helping communities thrive both online and offline.

*Ready to make a difference in your community? Start by attending a local event this week!*',
  'Explore how local events strengthen communities and create lasting connections between neighbors and friends.',
  'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=800&h=400&fit=crop',
  'Learn how local events build stronger communities and create meaningful connections between people.',
  now() - interval '6 hours',
  now() - interval '6 hours',
  now() - interval '6 hours'
),
(
  'Travel Tips: Making the Most of Your Next Adventure',
  'travel-tips-making-the-most-of-your-next-adventure',
  'blog_post',
  'published',
  '# Travel Tips: Making the Most of Your Next Adventure

Planning a trip can be both exciting and overwhelming. Whether you''re a seasoned traveler or embarking on your first big adventure, these tips will help you make the most of your journey.

## Before You Go

### Research Your Destination
- Learn about local customs and etiquette
- Check visa requirements and travel advisories
- Research the best time to visit for weather and crowds
- Look up local events happening during your stay

### Pack Smart
- Make a checklist and pack light
- Bring versatile clothing that can be mixed and matched
- Don''t forget essential documents and copies
- Pack a small first-aid kit

## During Your Trip

### Stay Connected but Present
- Download offline maps and translation apps
- Share your itinerary with someone at home
- But also put the phone down and be present in the moment

### Be Open to New Experiences
- Try local food (within reason for dietary restrictions)
- Talk to locals for insider recommendations
- Say yes to unexpected opportunities
- Keep a travel journal

### Safety First
- Trust your instincts
- Keep valuables secure
- Have emergency contacts readily available
- Know the location of your country''s embassy

## Making Connections

Travel is about more than just seeing new places - it''s about connecting with people and cultures. Some of our best travel memories come from the people we meet along the way.

### Use Technology to Enhance (Not Replace) Real Connections
- Use apps to find local events and meetups
- Connect with other travelers and locals online
- But prioritize face-to-face interactions

*Happy travels! Don''t forget to share your adventures with our community when you return.*',
  'Essential travel tips to help you plan better trips, stay safe, and create unforgettable memories on your adventures.',
  'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=400&fit=crop',
  'Get expert travel tips for planning better trips, staying safe, and creating unforgettable memories.',
  now() - interval '3 hours',
  now() - interval '3 hours',
  now() - interval '3 hours'
);