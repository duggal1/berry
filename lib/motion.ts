export const EASE_QUINT: [number,number,number,number]=[.22,1,.36,1]; export const EASE_STD: [number,number,number,number]=[.4,0,.2,1];
export const SCROLL_SPRING={stiffness:80,damping:24,mass:.6,restDelta:.0002};
export const SPRING={button:{type:"spring" as const,stiffness:110,damping:24,mass:1.3},faqHeight:{type:"spring" as const,stiffness:88,damping:20.5,mass:1.15,restDelta:.4,restSpeed:.4},faqY:{type:"spring" as const,stiffness:120,damping:22,mass:1,delay:.05},icon:{type:"spring" as const,stiffness:260,damping:34,mass:1}};
