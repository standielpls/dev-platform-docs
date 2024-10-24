"""
This script was generated by AI - it checks all links in the platform directory to make sure they're valid.
"""

import os
import re
import requests
from urllib.parse import urlparse, urljoin
from concurrent.futures import ThreadPoolExecutor, as_completed

def check_link(url):
    try:
        # Replace the domain with localhost:3000 for local verification
        parsed_url = urlparse(url)
        local_url = urljoin(f"http://localhost:3000", parsed_url.path)
        
        response = requests.head(local_url, allow_redirects=True, timeout=5)
        final_url = response.url
        return url, final_url, response.status_code
    except requests.RequestException as e:
        return url, None, str(e)

def find_links(file_path):
    with open(file_path, 'r', encoding='utf-8') as file:
        content = file.read()
        # This regex pattern matches both Markdown and HTML links
        links = re.findall(r'\[.*?\]\((.*?)\)|href=[\'"]?(https?://[^\'" >]+)', content)
        # Extract non-None links from tuples
        return [link for link_tuple in links for link in link_tuple if link and link.startswith('http')]

def check_links_in_platform(platform_path):
    all_links = []
    for root, _, files in os.walk(platform_path):
        for file in files:
            if file.endswith(('.md', '.mdx', '.html')):
                file_path = os.path.join(root, file)
                all_links.extend(find_links(file_path))

    results = {}
    with ThreadPoolExecutor(max_workers=10) as executor:
        future_to_url = {executor.submit(check_link, url): url for url in set(all_links)}
        for future in as_completed(future_to_url):
            url, final_url, status_code = future.result()
            results[url] = (final_url, status_code)

    return results

if __name__ == "__main__":
    platform_path = "./platform"  # Path to the platform folder
    results = check_links_in_platform(platform_path)

    print("Link Check Results:")
    for url, (final_url, status_code) in results.items():
        if status_code == 200:
            print(f"Valid: {url} -> {final_url} (Status: {status_code})")
        elif status_code:
            print(f"Redirect/Error: {url} -> {final_url} (Status: {status_code})")
        else:
            print(f"Error: {url} (No response)")
