import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
  structuredData?: object;
}

export function useSEO(data: SEOData = {}) {
  const location = useLocation();
  
  const defaultData = {
    title: 'Queer Guide - LGBTQ+ Community & Safe Spaces',
    description: 'Discover queer-friendly venues, events, businesses, and connect with the LGBTQ+ community worldwide. Find safe spaces, local events, and inclusive businesses.',
    keywords: 'LGBTQ+, queer, gay, lesbian, bisexual, transgender, safe spaces, queer venues, LGBTQ events, gay bars, inclusive businesses, pride events',
    image: '/og-image.jpg',
    type: 'website',
    url: `https://queerguide.app${location.pathname}`,
  };

  const seoData = { ...defaultData, ...data };

  useEffect(() => {
    // Update document title
    document.title = seoData.title;

    // Update meta tags
    updateMetaTag('description', seoData.description);
    updateMetaTag('keywords', seoData.keywords);
    
    // Update Open Graph tags
    updateMetaProperty('og:title', seoData.title);
    updateMetaProperty('og:description', seoData.description);
    updateMetaProperty('og:image', seoData.image);
    updateMetaProperty('og:url', seoData.url);
    updateMetaProperty('og:type', seoData.type);
    
    // Update Twitter Card tags
    updateMetaProperty('twitter:title', seoData.title);
    updateMetaProperty('twitter:description', seoData.description);
    updateMetaProperty('twitter:image', seoData.image);
    
    // Update canonical URL
    updateCanonicalURL(seoData.url);
    
    // Add structured data if provided
    if (seoData.structuredData) {
      updateStructuredData(seoData.structuredData);
    }
  }, [seoData]);

  const updateMetaTag = (name: string, content: string) => {
    let element = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement;
    if (!element) {
      element = document.createElement('meta');
      element.name = name;
      document.head.appendChild(element);
    }
    element.content = content;
  };

  const updateMetaProperty = (property: string, content: string) => {
    let element = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement;
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute('property', property);
      document.head.appendChild(element);
    }
    element.content = content;
  };

  const updateCanonicalURL = (url: string) => {
    let element = document.querySelector('link[rel="canonical"]') as HTMLLinkElement;
    if (!element) {
      element = document.createElement('link');
      element.rel = 'canonical';
      document.head.appendChild(element);
    }
    element.href = url;
  };

  const updateStructuredData = (data: object) => {
    const existingScript = document.querySelector('script[type="application/ld+json"]');
    if (existingScript) {
      existingScript.remove();
    }
    
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.textContent = JSON.stringify(data);
    document.head.appendChild(script);
  };

  return {
    updateSEO: (newData: SEOData) => {
      const updatedData = { ...seoData, ...newData };
      Object.keys(updatedData).forEach(key => {
        if (key === 'title') document.title = updatedData[key];
        if (key === 'description') updateMetaTag('description', updatedData[key]);
        if (key === 'keywords') updateMetaTag('keywords', updatedData[key]);
      });
    }
  };
}

// SEO utility functions for specific page types
export const generateVenueStructuredData = (venue: any) => ({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": venue.name,
  "description": venue.description,
  "address": {
    "@type": "PostalAddress",
    "streetAddress": venue.address,
    "addressLocality": venue.city,
    "addressCountry": venue.country
  },
  "geo": venue.latitude && venue.longitude ? {
    "@type": "GeoCoordinates",
    "latitude": venue.latitude,
    "longitude": venue.longitude
  } : undefined,
  "openingHours": venue.opening_hours,
  "telephone": venue.phone,
  "url": venue.website,
  "sameAs": venue.social_links,
  "amenityFeature": venue.amenities?.map((amenity: string) => ({
    "@type": "LocationFeatureSpecification",
    "name": amenity
  }))
});

export const generateEventStructuredData = (event: any) => ({
  "@context": "https://schema.org",
  "@type": "Event",
  "name": event.title,
  "description": event.description,
  "startDate": event.start_date,
  "endDate": event.end_date,
  "location": {
    "@type": "Place",
    "name": event.venue_name,
    "address": event.address
  },
  "organizer": {
    "@type": "Organization",
    "name": event.organizer
  },
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": event.is_online ? 
    "https://schema.org/OnlineEventAttendanceMode" : 
    "https://schema.org/OfflineEventAttendanceMode"
});

export const generateOrganizationStructuredData = () => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Queer Guide",
  "description": "A comprehensive guide to queer-friendly venues, events, and community resources worldwide",
  "url": "https://queerguide.app",
  "logo": "https://queerguide.app/logo.png",
  "sameAs": [
    "https://twitter.com/queerguide",
    "https://instagram.com/queerguide"
  ],
  "contactPoint": {
    "@type": "ContactPoint",
    "contactType": "customer service",
    "url": "https://queerguide.app/contact"
  }
});