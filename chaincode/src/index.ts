import {type Contract} from 'fabric-contract-api';
import {TraceabilityContract} from './traceability';

export const contracts: typeof Contract[] = [TraceabilityContract];
