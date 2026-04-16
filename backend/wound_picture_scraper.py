from icrawler.builtin import BingImageCrawler

keywords = {
    "burn": "burn injury skin medical",
    "cut": "deep cut wound skin injury",
    "infection": "infected wound skin pus redness",
    "ulcer": "skin ulcer wound medical"
}

for wound_type in ['burn', 'cut', 'infection', 'ulcer']:
    search_keyword = keywords.get(wound_type)
    
    crawler = BingImageCrawler(
        storage={'root_dir': f'./dataset/{wound_type}'}
    )
    
    crawler.crawl(
        keyword=search_keyword,
        max_num=300
    )