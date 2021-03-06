package org.jolokia.converter.json.simplifier;

import java.util.Map;
import java.net.URL;

/*
 *  Copyright 2009-2010 Roland Huss
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */


/**
 * @author roland
 * @since Jul 27, 2009
 */
public class UrlSimplifier extends SimplifierExtractor<URL> {
    public UrlSimplifier() {
        super(URL.class);
    }

    @Override
    void init(Map<String, AttributeExtractor<URL>> pStringExtractorMap) {
        addExtractors(new Object[][] {{ "url", new UrlAttributeExtractor() }});
    }

    private static class UrlAttributeExtractor implements AttributeExtractor<URL> {
        public Object extract(URL pUrl) { return pUrl.toExternalForm(); }
    }
}