/*
 * Copyright 2009-2011 Roland Huss
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package org.jolokia.util;

import java.util.HashSet;
import java.util.Set;

import javax.management.MBeanServerConnection;

/**
 * @author roland
 * @since 14.04.11
 */
public class MBeanConnectionUtils {


    public static Set<MBeanServerConnection> asSet(MBeanServerConnection... pConnections) {
        Set<MBeanServerConnection> ret = new HashSet<MBeanServerConnection>();
        for (MBeanServerConnection conn : pConnections) {
            ret.add(conn);
        }
        return ret;
    }
}
