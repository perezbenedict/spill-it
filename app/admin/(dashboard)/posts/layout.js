import {Fredoka,Balsamiq_Sans,Patrick_Hand,Caveat} from 'next/font/google';
const fredoka=Fredoka({subsets:['latin'],weight:'500',display:'swap',preload:false,variable:'--font-post-fredoka'});
const balsamiq=Balsamiq_Sans({subsets:['latin'],weight:'400',display:'swap',preload:false,variable:'--font-post-balsamiq'});
const patrick=Patrick_Hand({subsets:['latin'],weight:'400',display:'swap',preload:false,variable:'--font-post-patrick'});
const caveat=Caveat({subsets:['latin'],weight:'500',display:'swap',preload:false,variable:'--font-post-caveat'});
export default function PostFontLayout({children}){
 return <div data-post-fonts className={`${fredoka.variable} ${balsamiq.variable} ${patrick.variable} ${caveat.variable}`}>{children}</div>;
}
