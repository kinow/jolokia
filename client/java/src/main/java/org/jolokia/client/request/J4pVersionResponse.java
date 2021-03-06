package org.jolokia.client.request;

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

import org.json.simple.JSONObject;

/**
 * @author roland
 * @since Apr 24, 2010
 */
public final class J4pVersionResponse extends J4pResponse<J4pVersionRequest> {

    private String agentVersion;

    private String protocolVersion;

    J4pVersionResponse(J4pVersionRequest pRequest, JSONObject pResponse) {
        super(pRequest,pResponse);
        JSONObject value = (JSONObject) getValue();
        agentVersion = (String) value.get("agent");
        protocolVersion = (String) value.get("protocol");
    }

    public String getAgentVersion() {
        return agentVersion;
    }

    public String getProtocolVersion() {
        return protocolVersion;
    }
}
